import { Router, type Request, type Response } from "express";
import {
  constants as fsConstants,
  createReadStream,
  promises as fs,
  readFileSync,
  type Stats,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createHash } from "node:crypto";
import { TarArchive } from "archiver";

import { storage } from "../storage.js";
import { routesLogger as logger } from "../logger.js";
import { igdbClient, matchesCatalogMetadataFilters, type CatalogSearchCursor } from "../igdb.js";
import { checkAutoSearch, withGameOperationLock } from "../cron.js";
import { DownloaderManager } from "../downloaders/manager.js";
import { normalizeTitle } from "../../shared/title-utils.js";
import { quickAddGameByTitle } from "../game-quick-add.js";
import { buildEditionsResponse, groupLanguages, hoursToBeat } from "../content-catalog.js";
import {
  parseWantedContent,
  pendingAddons,
  wantedContentSchema,
  type WantedContentState,
} from "../wanted-content.js";
// Relative path, not the "@shared" alias — see the comment in
// game-quick-add.ts.
import { GAME_STATUSES, type Game } from "../../shared/schema.js";
import { getContentFilterFlags, excludeFilteredContent } from "../content-filter.js";
import { config } from "../config.js";
import { steamService } from "../steam.js";
import { validate } from "../middleware.js";

const { version: APP_VERSION } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
) as { version: string };

/**
 * Version of the integration contract itself, bumped when a change would break
 * an already-released extension. Clients check it during the ping handshake so
 * a mismatched pair fails loudly instead of misbehaving halfway through a sync.
 */
export const INTEGRATION_API_VERSION = 2;

/** Upper bound on a single library sync payload, to keep one request bounded. */
const MAX_SYNC_GAMES = 5000;
const MAX_CATALOG_RESULTS = 50;
const seerrDispatchQueues = new Map<string, Promise<void>>();
const INTERRUPTED_HANDOFF_MESSAGE =
  "Questarr restarted during a download handoff. Check the download client's queue and history before retrying.";

async function withSeerrDispatchQueue<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = seerrDispatchQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  seerrDispatchQueues.set(key, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (seerrDispatchQueues.get(key) === current) seerrDispatchQueues.delete(key);
  }
}

export const integrationRouter = Router();

// Every route below runs behind authenticateApiKeyOrToken, so req.user is
// always populated; this guard is defence-in-depth against a future mount that
// forgets the middleware.
integrationRouter.use((req, res, next) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Every response here varies by req.user (auth status, library contents),
  // so it must never be cached by a shared proxy or the client's HTTP cache.
  res.set("Cache-Control", "no-store");
  return next();
});

const seerrVariantSchema = z.object({
  operatingSystem: z.enum(["windows", "linux", "macos"]),
  architecture: z.enum(["x64", "arm64", "x86", "universal"]),
});

const seerrRequestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !Array.from(value).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      )
  );

const catalogLimitSchema = z.coerce.number().int().min(1).max(MAX_CATALOG_RESULTS).default(20);
const catalogCursorSchema = z.object({
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  approach: z.number().int().min(0).max(3),
  offset: z.number().int().min(0).max(10000),
  seenIds: z.array(z.number().int().positive()).max(1000),
});
const catalogQueryHash = (query: string) => createHash("sha256").update(query).digest("hex");
const parseCatalogPlatformIds = (value: unknown): number[] | null => {
  if (value === undefined) return [];
  if (typeof value !== "string" || !/^[0-9,]{1,600}$/.test(value)) return null;
  const ids = value.split(",").map(Number);
  return ids.length <= 100 && ids.every((id) => Number.isSafeInteger(id) && id > 0)
    ? [...new Set(ids)].sort((a, b) => a - b)
    : null;
};
const catalogSearchIdentity = (
  query: string,
  platformIds: number[],
  genre?: string,
  releaseYear?: number
) => `${query}:${platformIds.join(",")}:${genre?.toLocaleLowerCase() ?? ""}:${releaseYear ?? ""}`;
const safeArchiveBaseName = (value: string) => {
  const cleaned = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /[\\/:*?"<>|]/.test(character) || codePoint < 0x20 || codePoint === 0x7f
      ? "_"
      : character;
  })
    .join("")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  return cleaned || "game";
};
const parseCatalogMetadataFilters = (query: Request["query"]) => {
  const genre = z.string().trim().min(1).max(64).optional().safeParse(query.genre);
  const releaseYear = z.coerce
    .number()
    .int()
    .min(1950)
    .max(2200)
    .optional()
    .safeParse(query.releaseYear);
  return genre.success && releaseYear.success
    ? {
        ...(genre.data ? { genre: genre.data } : {}),
        ...(releaseYear.data ? { releaseYear: releaseYear.data } : {}),
      }
    : null;
};
const parseCatalogCursor = (
  value: unknown,
  query: string
): CatalogSearchCursor | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,20000}$/.test(value)) return null;
  try {
    const parsed = catalogCursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
    if (!parsed.success || parsed.data.queryHash !== catalogQueryHash(query)) return null;
    return {
      approach: parsed.data.approach,
      offset: parsed.data.offset,
      seenIds: parsed.data.seenIds,
    };
  } catch {
    return null;
  }
};
const encodeCatalogCursor = (cursor: CatalogSearchCursor, query: string): string =>
  Buffer.from(JSON.stringify({ ...cursor, queryHash: catalogQueryHash(query) })).toString(
    "base64url"
  );

const seerrGameSchema = (value: unknown) => {
  const game = igdbClient.formatGameData(value as Parameters<typeof igdbClient.formatGameData>[0]);
  return {
    id: `igdb-${String(game.igdbId)}`,
    igdbId: Number(game.igdbId),
    title: String(game.title ?? ""),
    summary: String(game.summary ?? ""),
    coverUrl: String(game.coverUrl ?? ""),
    releaseDate: String(game.releaseDate ?? ""),
    platforms: Array.isArray(game.platforms) ? game.platforms : [],
    platformOptions: Array.isArray(game.platformOptions) ? game.platformOptions : [],
    genres: Array.isArray(game.genres) ? game.genres : [],
    steamAppId:
      typeof game.steamAppId === "number" && Number.isSafeInteger(game.steamAppId)
        ? game.steamAppId
        : null,
    timeToBeat: null as { hastily?: number; normally?: number; completely?: number } | null,
  };
};

const withSeerrTimeToBeats = async <T extends { igdbId: number }>(games: T[]) => {
  if (games.length === 0) return games.map((game) => ({ ...game, timeToBeat: null }));
  try {
    const estimates = await igdbClient.getTimeToBeats(games.map((game) => game.igdbId));
    return games.map((game) => ({
      ...game,
      timeToBeat: estimates.get(game.igdbId) ?? null,
    }));
  } catch (error) {
    logger.warn({ error }, "SeerrNG time-to-beat lookup failed");
    return games.map((game) => ({ ...game, timeToBeat: null }));
  }
};

const seerrGameDetailSchema = (value: unknown) => {
  const game = igdbClient.formatGameData(value as Parameters<typeof igdbClient.formatGameData>[0]);
  const source = value as { videos?: Array<{ name?: string; video_id?: string }> };
  return {
    ...seerrGameSchema(value),
    rating: typeof game.rating === "number" ? game.rating : null,
    publishers: Array.isArray(game.publishers) ? game.publishers.slice(0, 20) : [],
    developers: Array.isArray(game.developers) ? game.developers.slice(0, 20) : [],
    screenshots: Array.isArray(game.screenshots) ? game.screenshots.slice(0, 12) : [],
    videos: (Array.isArray(source.videos) ? source.videos : [])
      .filter(
        (video) =>
          video && typeof video.video_id === "string" && /^[A-Za-z0-9_-]{11}$/.test(video.video_id)
      )
      .slice(0, 6)
      .map((video) => ({ name: String(video.name ?? "").slice(0, 120), videoId: video.video_id })),
  };
};

const findSeerrGame = async (userId: string, externalRequestId: string) => {
  const request = await storage.getIntegrationRequest(userId, externalRequestId);
  if (request?.gameId) {
    const game = await storage.getGame(request.gameId);
    if (game?.userId === userId) return game;
  }
  // Keep requests created before the durable ledger was introduced readable.
  return (await storage.getUserGames(userId, true)).find(
    (game) => game.seerrExternalRequestId === externalRequestId
  );
};

const isContainedPath = (candidate: string, root: string): boolean =>
  candidate === root || candidate.startsWith(`${root.replace(/[\\/]+$/, "")}${path.sep}`);

const getSeerrAssets = async (userId: string, gameId: string) => {
  const [files, config] = await Promise.all([
    storage.getGameFiles(gameId),
    storage.getImportConfig(userId),
  ]);
  let libraryRoot: string;
  try {
    libraryRoot = await fs.realpath(config.libraryRoot);
  } catch {
    return [];
  }

  const assets = [];
  for (const file of files.slice(0, 100)) {
    try {
      const realPath = await fs.realpath(file.filePath);
      if (!isContainedPath(realPath, libraryRoot)) continue;
      const stats = await fs.stat(realPath);
      if (!stats.isFile()) continue;
      assets.push({
        id: file.id,
        name: path.basename(file.originalName || file.storedName || realPath),
        size: stats.size,
        path: realPath,
      });
    } catch {
      // A stale import row or a removed file is not a deliverable asset.
    }
  }
  return assets;
};

const safeArchiveEntryName = (name: string, index: number, used: Set<string>) => {
  const basename = name
    .split(/[\\/]/)
    .pop()
    ?.replace(/\p{Cc}/gu, "")
    .trim();
  const original =
    basename && basename !== "." && basename !== ".." ? basename : `asset-${index + 1}`;
  let candidate = original;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase("en-US"))) {
    const extension = path.extname(original);
    const stem = extension ? original.slice(0, -extension.length) : original;
    candidate = `${stem} (${suffix++})${extension}`;
  }
  used.add(candidate.toLocaleLowerCase("en-US"));
  return candidate;
};

const getSeerrRequest = async (userId: string, externalRequestId: string) => {
  const ledger = await storage.getIntegrationRequest(userId, externalRequestId);
  const game = await findSeerrGame(userId, externalRequestId);
  if (!game) {
    if (!ledger) return undefined;
    return {
      externalRequestId,
      status: ledger.status,
      deliverable: false,
      error: ledger.errorMessage,
      title: ledger.title,
      game: null,
      variant: {
        operatingSystem: ledger.operatingSystem,
        architecture: ledger.architecture,
      },
      identity: ledger.igdbId ? { catalogProvider: "igdb", catalogId: ledger.igdbId } : undefined,
      actions: {
        retry: ledger.status === "failed",
        cancel: false,
        cancelReason: "This request is not linked to an acquisition record yet.",
      },
    };
  }

  const [assets, downloads] = await Promise.all([
    getSeerrAssets(userId, game.id),
    storage.getDownloadsByGameId(game.id),
  ]);
  const latestDownload = [...downloads].sort(
    (a, b) => (b.addedAt?.getTime() ?? 0) - (a.addedAt?.getTime() ?? 0)
  )[0];
  const downloadStatus = latestDownload?.status.toLowerCase() ?? "";
  let status:
    "accepted" | "searching" | "downloading" | "importing" | "available" | "failed" | "cancelled";
  if (game.seerrCancelled || game.status === "shelved") {
    status = "cancelled";
  } else if (["owned", "playing", "completed"].includes(game.status) || assets.length > 0) {
    status = "available";
  } else if (game.seerrRecoveryRequired) {
    status = "failed";
  } else if (["unpacking", "importing", "manual_review_required"].includes(downloadStatus)) {
    status = "importing";
  } else if (["downloading", "queued", "paused"].includes(downloadStatus)) {
    status = "downloading";
  } else if (["failed", "error", "import-failed"].includes(downloadStatus)) {
    status = "failed";
  } else if (game.status === "downloading") {
    status = "downloading";
  } else if (game.seerrDispatching) {
    status = "searching";
  } else if (game.searchResultsAvailable) {
    status = "searching";
  } else if (game.status === "wanted") {
    status = "failed";
  } else {
    status = "accepted";
  }

  // Content the requester selected counts as outstanding until it is acquired,
  // even when the base game is already in the library.
  const wantedState = parseWantedContent(ledger?.selection);
  const outstanding = wantedState
    ? wantedState.selection.mode === "edition"
      ? wantedState.targets.edition &&
        !wantedState.acquiredAddonIds.includes(wantedState.targets.edition.id)
        ? [wantedState.targets.edition]
        : []
      : pendingAddons(wantedState)
    : [];
  if (outstanding.length > 0 && status === "available") {
    status = ["downloading", "queued", "paused"].includes(downloadStatus)
      ? "downloading"
      : "searching";
  }

  const request = {
    externalRequestId,
    status,
    deliverable: assets.length > 0,
    content: wantedState
      ? {
          mode: wantedState.selection.mode,
          pending: outstanding.map((entry) => ({ id: entry.id, title: entry.title })),
          acquiredCount: wantedState.acquiredAddonIds.length,
        }
      : undefined,
    error:
      status === "failed"
        ? game.seerrRecoveryRequired
          ? INTERRUPTED_HANDOFF_MESSAGE
          : (latestDownload?.errorMessage ?? "No usable release was found.")
        : null,
    title: game.title,
    game: { id: game.id, title: game.title, status: game.status },
    variant: game.seerrVariant ?? undefined,
    identity: Number.isSafeInteger(ledger?.igdbId ?? game.igdbId)
      ? { catalogProvider: "igdb", catalogId: ledger?.igdbId ?? game.igdbId }
      : undefined,
    actions: {
      retry: status === "failed",
      cancel: !["available", "cancelled"].includes(status),
    },
  };
  if (ledger) {
    await storage.updateIntegrationRequest(userId, externalRequestId, {
      gameId: game.id,
      downloadId: latestDownload?.id ?? null,
      status,
      errorMessage: request.error,
    });
  }
  return request;
};

// ── SeerrNG software-provider contract ──────────────────────────────────────
// This is intentionally separate from the general integration API above. It
// is versioned because SeerrNG persists the external request identity and
// expects provider-side retry and asset routes to remain idempotent.
integrationRouter.get("/seerrng/v1/ping", (_req: Request, res: Response) => {
  res.json({
    service: "QuestarrNG",
    version: APP_VERSION,
    apiVersion: 1,
    requestContractVersion: INTEGRATION_API_VERSION,

    capabilities: {
      catalog: true,
      pcAcquisition: true,
      emulationAcquisition: false,
      requestActions: { retry: true, cancel: true },
      assetStreaming: true,
      assetBundles: true,
      // Editions and add-ons as requestable content, and attribute discovery.
      editions: true,
      discover: true,
      wantedContent: true,
    },
  });
});

integrationRouter.get("/seerrng/v1/catalog/search", async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = catalogLimitSchema.safeParse(req.query.limit ?? 20);
  if (!query || query.length > 200 || !limit.success) {
    return res.status(400).json({ error: "A valid search query and limit are required." });
  }
  try {
    const games = (await igdbClient.searchGames(query, limit.data)).map(seerrGameSchema);
    return res.json(await withSeerrTimeToBeats(games));
  } catch (error) {
    logger.error({ error }, "SeerrNG catalog search failed");
    return res.status(502).json({ error: "IGDB catalog search failed." });
  }
});

integrationRouter.get("/seerrng/v1/catalog/search-page", async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = catalogLimitSchema.safeParse(req.query.limit ?? 20);
  const platformIds = parseCatalogPlatformIds(req.query.platformIds);
  const filters = parseCatalogMetadataFilters(req.query);
  const identity = catalogSearchIdentity(
    query,
    platformIds ?? [],
    filters?.genre,
    filters?.releaseYear
  );
  const cursor = parseCatalogCursor(req.query.cursor, identity);
  if (
    !query ||
    query.length > 200 ||
    !limit.success ||
    cursor === null ||
    platformIds === null ||
    !filters
  ) {
    return res.status(400).json({ error: "A valid search query, limit, and cursor are required." });
  }
  try {
    const page = await igdbClient.searchCatalogPage(
      query,
      limit.data,
      cursor,
      platformIds,
      filters
    );
    return res.json({
      results: await withSeerrTimeToBeats(page.results.map(seerrGameSchema)),
      nextCursor: page.cursor ? encodeCatalogCursor(page.cursor, identity) : null,
    });
  } catch (error) {
    logger.error({ error }, "SeerrNG paged catalog search failed");
    return res.status(502).json({ error: "IGDB catalog search failed." });
  }
});

integrationRouter.get("/seerrng/v1/catalog/popular", async (req: Request, res: Response) => {
  const limit = catalogLimitSchema.safeParse(req.query.limit ?? 20);
  if (!limit.success) return res.status(400).json({ error: "Invalid result limit." });
  try {
    const games = (await igdbClient.getPopularGames(limit.data)).map(seerrGameSchema);
    return res.json(await withSeerrTimeToBeats(games));
  } catch (error) {
    logger.error({ error }, "SeerrNG popular catalog fetch failed");
    return res.status(502).json({ error: "IGDB catalog is unavailable." });
  }
});

integrationRouter.get("/seerrng/v1/catalog/popular-page", async (req: Request, res: Response) => {
  const limit = catalogLimitSchema.safeParse(req.query.limit ?? 20);
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .safeParse(req.query.offset ?? 0);
  const platformIds = parseCatalogPlatformIds(req.query.platformIds);
  const filters = parseCatalogMetadataFilters(req.query);
  if (!limit.success || !offset.success || platformIds === null || !filters) {
    return res
      .status(400)
      .json({ error: "A valid result limit, offset, and platform list are required." });
  }
  try {
    if (platformIds.length === 0 && !filters.genre && !filters.releaseYear) {
      const games = await igdbClient.getPopularGames(limit.data + 1, offset.data);
      return res.json({
        results: await withSeerrTimeToBeats(games.slice(0, limit.data).map(seerrGameSchema)),
        nextOffset:
          games.length > limit.data && offset.data + limit.data <= 10000
            ? offset.data + limit.data
            : null,
      });
    }

    const allowedPlatforms = new Set(platformIds);
    const games = [];
    let currentOffset = offset.data;
    let hasMore = false;
    for (let batch = 0; batch < 8 && currentOffset <= 10000; batch++) {
      const take = limit.data - games.length;
      const raw = await igdbClient.getPopularGames(take, currentOffset);
      currentOffset += raw.length;
      games.push(
        ...raw.filter(
          (game) =>
            (allowedPlatforms.size === 0 ||
              game.platforms?.some((platform) => allowedPlatforms.has(platform.id))) &&
            matchesCatalogMetadataFilters(game, filters)
        )
      );
      hasMore = raw.length === take;
      if (!hasMore || games.length >= limit.data) break;
    }
    return res.json({
      results: await withSeerrTimeToBeats(games.map(seerrGameSchema)),
      nextOffset: hasMore && currentOffset <= 10000 ? currentOffset : null,
    });
  } catch (error) {
    logger.error({ error }, "SeerrNG paged popular catalog fetch failed");
    return res.status(502).json({ error: "IGDB catalog is unavailable." });
  }
});

integrationRouter.get("/seerrng/v1/catalog/platforms", async (_req: Request, res: Response) => {
  try {
    return res.json(await igdbClient.getPlatforms());
  } catch (error) {
    logger.error({ error }, "SeerrNG platform catalog fetch failed");
    return res.status(502).json({ error: "IGDB platform catalog is unavailable." });
  }
});

integrationRouter.get("/seerrng/v1/catalog/games/:igdbId", async (req: Request, res: Response) => {
  const igdbId = Number(req.params.igdbId);
  if (!Number.isSafeInteger(igdbId) || igdbId <= 0) {
    return res.status(400).json({ error: "Invalid IGDB game ID." });
  }
  const rawPlatformId = req.query.platformId;
  const platformId =
    typeof rawPlatformId === "string" && /^[1-9]\d{0,6}$/.test(rawPlatformId)
      ? Number(rawPlatformId)
      : undefined;
  if (rawPlatformId !== undefined && (!platformId || platformId > 1_000_000)) {
    return res.status(400).json({ error: "Invalid IGDB platform ID." });
  }
  try {
    const game =
      platformId === undefined
        ? await igdbClient.getGameById(igdbId, true)
        : await igdbClient.getGameByIdForPlatform(igdbId, platformId, true);
    if (!game) return res.status(404).json({ error: "Game not found." });
    const [detail] = await withSeerrTimeToBeats([seerrGameDetailSchema(game)]);
    if (platformId === undefined) return res.json(detail);
    return res.json({
      ...detail,
      platformReleaseDate: "platformReleaseDate" in game ? game.platformReleaseDate : null,
    });
  } catch (error) {
    logger.error({ error, igdbId }, "SeerrNG catalog game fetch failed");
    return res.status(502).json({ error: "IGDB catalog is unavailable." });
  }
});

const catalogFacetList = (value: unknown, max = 20): string[] | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 1500) return null;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > max || items.some((item) => item.length > 80)) return null;
  return items;
};

integrationRouter.get(
  "/seerrng/v1/catalog/games/:igdbId/editions",
  async (req: Request, res: Response) => {
    const igdbId = Number(req.params.igdbId);
    if (!Number.isSafeInteger(igdbId) || igdbId <= 0) {
      return res.status(400).json({ error: "Invalid IGDB game ID." });
    }
    try {
      const graph = await igdbClient.getEditionGraph(igdbId);
      const ids = new Set<number>([
        igdbId,
        ...graph.editions.map((edition) => edition.id),
        ...[graph.base, ...graph.editions].flatMap((game) =>
          [
            ...(game?.dlcs ?? []),
            ...(game?.expansions ?? []),
            ...(game?.standalone_expansions ?? []),
          ].map((ref) => ref.id)
        ),
      ]);
      const library = await storage.getUserGamesByIgdbIds(req.user!.id, [...ids].slice(0, 200));
      const ownedGames = library.filter((game) =>
        ["owned", "playing", "completed"].includes(game.status)
      );
      const owned = new Set(
        ownedGames.flatMap((game) => (typeof game.igdbId === "number" ? [game.igdbId] : []))
      );
      const baseStatus = library.find((game) => game.igdbId === igdbId)?.status;
      const response = buildEditionsResponse(graph, { ids: owned, baseStatus });
      if (!response) return res.status(404).json({ error: "Game not found." });
      return res.json(response);
    } catch (error) {
      logger.error({ error, igdbId }, "SeerrNG edition lookup failed");
      return res.status(502).json({ error: "IGDB catalog is unavailable." });
    }
  }
);

integrationRouter.get("/seerrng/v1/catalog/discover", async (req: Request, res: Response) => {
  const rawLists = {
    themes: catalogFacetList(req.query.themes),
    gameModes: catalogFacetList(req.query.gameModes),
    perspectives: catalogFacetList(req.query.perspectives),
    genres: catalogFacetList(req.query.genres),
    languages: catalogFacetList(req.query.languages),
    excludeThemes: catalogFacetList(req.query.excludeThemes),
    excludeGameModes: catalogFacetList(req.query.excludeGameModes),
    excludeGenres: catalogFacetList(req.query.excludeGenres),
  };
  if (Object.values(rawLists).some((value) => value === null)) {
    return res.status(400).json({ error: "Invalid discovery filter." });
  }
  const lists = rawLists as Record<keyof typeof rawLists, string[] | undefined>;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 24) || 24, 1), 48);
  const minYear = req.query.minYear === undefined ? undefined : Number(req.query.minYear);
  const maxHours =
    req.query.maxHoursToBeat === undefined ? undefined : Number(req.query.maxHoursToBeat);
  if (
    (minYear !== undefined &&
      (!Number.isSafeInteger(minYear) || minYear < 1970 || minYear > 2100)) ||
    (maxHours !== undefined && (!Number.isFinite(maxHours) || maxHours <= 0 || maxHours > 2000))
  ) {
    return res.status(400).json({ error: "Invalid discovery filter." });
  }
  const cursorValue = req.query.cursor;
  const offset =
    typeof cursorValue === "string" && /^\d{1,5}$/.test(cursorValue) ? Number(cursorValue) : 0;
  const query = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
  const hasFilter =
    !!query ||
    Object.values(lists).some((value) => value && value.length > 0) ||
    minYear !== undefined ||
    maxHours !== undefined;
  if (!hasFilter) {
    return res.status(400).json({ error: "Provide at least one discovery filter." });
  }
  try {
    const games = await igdbClient.discoverGames(
      {
        query,
        themes: lists.themes,
        gameModes: lists.gameModes,
        perspectives: lists.perspectives,
        genres: lists.genres,
        languages: lists.languages,
        excludeThemes: lists.excludeThemes,
        excludeGameModes: lists.excludeGameModes,
        excludeGenres: lists.excludeGenres,
        minYear,
      },
      limit,
      offset
    );
    const filterFlags = await getContentFilterFlags(req.user!.id);
    const visible = excludeFilteredContent(
      games.map((game) => ({ ...igdbClient.formatGameData(game), __game: game })),
      filterFlags
    );
    const times = await igdbClient
      .getTimeToBeats(games.map((game) => game.id))
      .catch(() => new Map());
    const results = visible
      .map(({ __game }) => {
        const base = seerrGameSchema(__game);
        const timeToBeat = times.get(__game.id) ?? null;
        return {
          ...base,
          timeToBeat,
          themes: __game.themes?.map((theme) => theme.name) ?? [],
          gameModes: __game.game_modes?.map((mode) => mode.name) ?? [],
          perspectives: __game.player_perspectives?.map((p) => p.name) ?? [],
          languages: groupLanguages(__game),
        };
      })
      .filter(
        (game) => maxHours === undefined || (hoursToBeat(game.timeToBeat) ?? Infinity) <= maxHours
      );
    return res.json({
      results,
      nextCursor: games.length >= limit ? String(offset + limit) : null,
    });
  } catch (error) {
    logger.error({ error }, "SeerrNG discovery failed");
    return res.status(502).json({ error: "IGDB catalog is unavailable." });
  }
});

integrationRouter.get("/seerrng/v1/library/lookup", async (req: Request, res: Response) => {
  const igdbIds = parseCatalogPlatformIds(req.query.igdbIds);
  const steamAppIds = (() => {
    const raw = req.query.steamAppIds;
    if (raw === undefined) return [];
    if (typeof raw !== "string" || raw.length > 1200) return null;
    const parts = raw.split(",");
    if (parts.length > 100) return null;
    const values = parts.map((part) => Number(part));
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) return null;
    return Array.from(new Set(values));
  })();
  if (!igdbIds || igdbIds.length === 0 || steamAppIds === null) {
    return res.status(400).json({ error: "Provide up to 100 IGDB IDs and Steam App IDs." });
  }
  try {
    const games = await storage.getUserGamesByIgdbIds(req.user!.id, igdbIds);
    const filterFlags = await getContentFilterFlags(req.user!.id);
    const visibleGames = excludeFilteredContent(games, filterFlags);
    const steamUser =
      config.steam.apiKey && steamAppIds.length > 0 ? await storage.getUser(req.user!.id) : null;
    const ownedAppIds =
      config.steam.apiKey && steamUser?.steamId64 && steamAppIds.length > 0
        ? await steamService.getOwnedGameAppIds(config.steam.apiKey, steamUser.steamId64)
        : null;
    return res.json({
      games: await Promise.all(
        visibleGames.map(async (game) => ({
          igdbId: game.igdbId,
          status: game.status,
          deliverable: (await getSeerrAssets(req.user!.id, game.id)).length > 0,
        }))
      ),
      steamGames: steamAppIds.map((steamAppId) => ({
        steamAppId,
        owned: ownedAppIds ? ownedAppIds.has(steamAppId) : null,
      })),
    });
  } catch (error) {
    logger.error({ error }, "SeerrNG library lookup failed");
    return res.status(500).json({ error: "Library lookup failed." });
  }
});

const seerrCreateRequestSchema = z.object({
  externalRequestId: seerrRequestIdSchema,
  title: z.string().trim().min(1).max(500),
  igdbId: z.number().int().positive().optional(),
  variant: seerrVariantSchema,
  // An edition or specific add-ons beyond the base game (contract v2).
  selection: wantedContentSchema.optional(),
});

/**
 * Resolves a content selection into the titles it names. Ids IGDB does not
 * link to the game are rejected so a request cannot name unrelated content.
 */
const buildWantedContentState = async (
  igdbId: number,
  selection: z.infer<typeof wantedContentSchema>
): Promise<WantedContentState | null> => {
  const graph = await igdbClient.getEditionGraph(igdbId);
  if (!graph.base) return null;
  const refs = (game: {
    dlcs?: { id: number; name: string }[];
    expansions?: { id: number; name: string }[];
    standalone_expansions?: { id: number; name: string }[];
  }) => [...(game.dlcs ?? []), ...(game.expansions ?? []), ...(game.standalone_expansions ?? [])];
  const known = new Map(refs(graph.base).map((ref) => [ref.id, ref.name]));
  const targets: WantedContentState["targets"] = { addons: [] };
  if (selection.mode === "edition") {
    const edition = graph.editions.find((entry) => entry.id === selection.editionId);
    if (!edition) return null;
    targets.edition = {
      id: edition.id,
      title: edition.version_title ? `${graph.base.name} ${edition.version_title}` : edition.name,
      ...(edition.version_title ? { versionTitle: edition.version_title } : {}),
    };
  } else {
    for (const id of selection.addonIds ?? []) {
      const name = known.get(id);
      if (!name) return null;
      targets.addons.push({ id, title: name });
    }
    if (targets.addons.length === 0) return null;
  }
  return { selection, targets, acquiredAddonIds: [] };
};

integrationRouter.post(
  "/seerrng/v1/requests",
  validate(seerrCreateRequestSchema),
  async (req: Request, res: Response) => {
    const parsed = seerrCreateRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid software request payload." });
    const { externalRequestId, title, igdbId, variant, selection } = parsed.data;
    if (selection && !igdbId) {
      return res.status(400).json({ error: "A content selection needs an exact IGDB title." });
    }
    let wantedState: WantedContentState | null = null;
    if (selection && igdbId) {
      try {
        wantedState = await buildWantedContentState(igdbId, selection);
      } catch (error) {
        logger.error({ error, igdbId }, "SeerrNG content selection lookup failed");
        return res.status(502).json({ error: "IGDB catalog is unavailable." });
      }
      if (!wantedState) {
        return res
          .status(400)
          .json({ error: "The selected content does not belong to this game." });
      }
    }
    const selectionJson = wantedState ? JSON.stringify(wantedState) : null;
    return withSeerrDispatchQueue(`${req.user!.id}:${normalizeTitle(title)}`, async () => {
      try {
        let ledger = await storage.getIntegrationRequest(req.user!.id, externalRequestId);
        if (ledger) {
          const sameRequest =
            ledger.title === title &&
            ledger.operatingSystem === variant.operatingSystem &&
            ledger.architecture === variant.architecture &&
            (ledger.igdbId ?? null) === (igdbId ?? null) &&
            // A retried request keeps its original selection and progress.
            (ledger.selection === null) === (selectionJson === null);
          if (!sameRequest) {
            return res.status(409).json({
              error: "externalRequestId is already bound to a different request identity.",
            });
          }
          const existingGame = await findSeerrGame(req.user!.id, externalRequestId);
          if (
            igdbId &&
            existingGame &&
            typeof existingGame.igdbId === "number" &&
            Number.isSafeInteger(existingGame.igdbId) &&
            existingGame.igdbId !== igdbId
          ) {
            return res
              .status(409)
              .json({ error: "externalRequestId is already bound to a different IGDB title." });
          }
          return res.status(200).json(await getSeerrRequest(req.user!.id, externalRequestId));
        } else {
          ledger = await storage.addIntegrationRequest({
            userId: req.user!.id,
            externalRequestId,
            title,
            igdbId: igdbId ?? null,
            operatingSystem: variant.operatingSystem,
            architecture: variant.architecture,
            selection: selectionJson,
          });
        }
        const existing = await findSeerrGame(req.user!.id, externalRequestId);
        if (existing) {
          if (igdbId && existing.igdbId !== igdbId) {
            return res
              .status(409)
              .json({ error: "The request is already linked to a different IGDB title." });
          }
          await storage.updateIntegrationRequest(req.user!.id, externalRequestId, {
            gameId: existing.id,
          });
          const current = await getSeerrRequest(req.user!.id, externalRequestId);
          return res.status(200).json(current);
        }

        // A selection can be requested for a game already in the library. The
        // existing game is linked and the selected content is searched for,
        // without re-adding or changing what the person owns.
        if (wantedState && igdbId) {
          const [libraryGame] = await storage.getUserGamesByIgdbIds(req.user!.id, [igdbId]);
          if (libraryGame) {
            await storage.updateIntegrationRequest(req.user!.id, externalRequestId, {
              gameId: libraryGame.id,
              status: "searching",
              errorMessage: null,
              attemptedAt: new Date(),
            });
            await checkAutoSearch({ userId: req.user!.id, gameId: libraryGame.id, force: true });
            return res.status(201).json(await getSeerrRequest(req.user!.id, externalRequestId));
          }
        }

        const result = await quickAddGameByTitle(req.user!.id, title, {
          status: "wanted",
          source: "api",
          ...(igdbId ? { igdbId } : {}),
          seerrExternalRequestId: externalRequestId,
          seerrVariant: variant,
          targetOperatingSystem: variant.operatingSystem,
          targetArchitecture: variant.architecture,
        });
        if (result.outcome === "not_found") {
          await storage.updateIntegrationRequest(req.user!.id, externalRequestId, {
            status: "failed",
            errorMessage: "No matching PC game was found.",
          });
          return res.status(404).json({ error: "No matching PC game was found." });
        }
        if (result.outcome === "duplicate") {
          await storage.updateIntegrationRequest(req.user!.id, externalRequestId, {
            status: "failed",
            errorMessage: "Game is already linked to another request.",
          });
          return res.status(409).json({ error: "Game is already linked to another request." });
        }
        await storage.updateIntegrationRequest(req.user!.id, externalRequestId, {
          gameId: result.game.id,
          status: "searching",
          errorMessage: null,
          attemptedAt: new Date(),
        });
        if (!result.game.seerrCancelled && result.game.status === "wanted") {
          await checkAutoSearch({ userId: req.user!.id, gameId: result.game.id, force: true });
        }
        return res.status(201).json(await getSeerrRequest(req.user!.id, externalRequestId));
      } catch (error) {
        logger.error({ error, externalRequestId }, "SeerrNG software request failed");
        return res.status(500).json({ error: "Software request could not be started." });
      }
    });
  }
);

integrationRouter.get(
  "/seerrng/v1/requests/:externalRequestId",
  async (req: Request, res: Response) => {
    const externalRequestId = seerrRequestIdSchema.safeParse(req.params.externalRequestId);
    if (!externalRequestId.success) return res.status(400).json({ error: "Invalid request ID." });
    try {
      const request = await getSeerrRequest(req.user!.id, externalRequestId.data);
      return request ? res.json(request) : res.status(404).json({ error: "Request not found." });
    } catch (error) {
      logger.error({ error }, "SeerrNG software request status failed");
      return res.status(500).json({ error: "Request status is unavailable." });
    }
  }
);

integrationRouter.post(
  "/seerrng/v1/requests/:externalRequestId/retry",
  validate(
    z
      .object({ confirmNoExistingDownload: z.boolean().optional() })
      .passthrough()
      .optional()
      .default({})
  ),
  async (req: Request, res: Response) => {
    const externalRequestId = seerrRequestIdSchema.safeParse(req.params.externalRequestId);
    if (!externalRequestId.success) return res.status(400).json({ error: "Invalid request ID." });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (
      "confirmNoExistingDownload" in body &&
      typeof body.confirmNoExistingDownload !== "boolean"
    ) {
      return res.status(400).json({ error: "Invalid retry confirmation." });
    }
    const confirmNoExistingDownload = body.confirmNoExistingDownload === true;
    try {
      let game = await findSeerrGame(req.user!.id, externalRequestId.data);
      if (!game) {
        const ledger = await storage.getIntegrationRequest(req.user!.id, externalRequestId.data);
        if (!ledger) return res.status(404).json({ error: "Request not found." });
        const recovered = await quickAddGameByTitle(req.user!.id, ledger.title, {
          status: "wanted",
          source: "api",
          ...(ledger.igdbId ? { igdbId: ledger.igdbId } : {}),
          targetOperatingSystem: ledger.operatingSystem,
          targetArchitecture: ledger.architecture,
          seerrExternalRequestId: externalRequestId.data,
          seerrVariant: {
            operatingSystem: ledger.operatingSystem as "windows" | "linux" | "macos",
            architecture: ledger.architecture as "x64" | "arm64" | "x86" | "universal",
          },
        });
        if (recovered.outcome === "not_found") {
          await storage.updateIntegrationRequest(req.user!.id, externalRequestId.data, {
            status: "failed",
            errorMessage: "No matching PC game was found.",
          });
          return res.status(404).json({ error: "No matching PC game was found." });
        }
        if (recovered.outcome === "duplicate") {
          await storage.updateIntegrationRequest(req.user!.id, externalRequestId.data, {
            status: "failed",
            errorMessage: "Game is already linked to another request.",
          });
          return res.status(409).json({ error: "Game is already linked to another request." });
        }
        game = recovered.game;
        await storage.updateIntegrationRequest(req.user!.id, externalRequestId.data, {
          gameId: game.id,
          status: "searching",
          errorMessage: null,
          attemptedAt: new Date(),
        });
      }
      let retryError: { status: number; error: string } | undefined;
      let confirmationRequired = false;
      await withGameOperationLock(game.id, async () => {
        const currentGame = await storage.getGame(game.id);
        if (!currentGame) {
          retryError = { status: 404, error: "Request not found." };
          return;
        }
        if (currentGame.seerrCancelled || currentGame.status === "shelved") {
          retryError = { status: 409, error: "Cancelled requests cannot be retried." };
          return;
        }
        if (currentGame.seerrDispatching) {
          retryError = {
            status: 409,
            error: "Another acquisition or cancellation operation is in progress.",
          };
          return;
        }
        if (currentGame.seerrRecoveryRequired && !confirmNoExistingDownload) {
          confirmationRequired = true;
          return;
        }
        const assets = await getSeerrAssets(req.user!.id, currentGame.id);
        if (["owned", "playing", "completed"].includes(currentGame.status) || assets.length > 0) {
          retryError = { status: 409, error: "The game is already available." };
          return;
        }
        await storage.updateGame(currentGame.id, {
          status: "wanted",
          seerrRecoveryRequired: false,
          searchResultsAvailable: false,
        });
      });
      if (retryError) return res.status(retryError.status).json({ error: retryError.error });
      if (confirmationRequired) {
        return res.status(409).json({
          confirmationRequired: "confirmNoExistingDownload",
          error: INTERRUPTED_HANDOFF_MESSAGE,
        });
      }
      await checkAutoSearch({ userId: req.user!.id, gameId: game.id, force: true });
      return res.json(await getSeerrRequest(req.user!.id, externalRequestId.data));
    } catch (error) {
      logger.error({ error }, "SeerrNG software request retry failed");
      return res.status(500).json({ error: "Request could not be retried." });
    }
  }
);

integrationRouter.post(
  "/seerrng/v1/requests/:externalRequestId/cancel",
  validate(
    z
      .object({ confirmNoExistingDownload: z.boolean().optional() })
      .passthrough()
      .optional()
      .default({})
  ),
  async (req: Request, res: Response) => {
    const externalRequestId = seerrRequestIdSchema.safeParse(req.params.externalRequestId);
    if (!externalRequestId.success) return res.status(400).json({ error: "Invalid request ID." });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (
      "confirmNoExistingDownload" in body &&
      typeof body.confirmNoExistingDownload !== "boolean"
    ) {
      return res.status(400).json({ error: "Invalid cancellation confirmation." });
    }
    const confirmNoExistingDownload = body.confirmNoExistingDownload === true;
    try {
      const game = await findSeerrGame(req.user!.id, externalRequestId.data);
      if (!game) return res.status(404).json({ error: "Request not found." });
      return await withGameOperationLock(game.id, async () => {
        const currentGame = await storage.getGame(game.id);
        if (!currentGame) return res.status(404).json({ error: "Request not found." });
        if (currentGame.seerrCancelled)
          return res.json(await getSeerrRequest(req.user!.id, externalRequestId.data));
        if (currentGame.seerrRecoveryRequired && !confirmNoExistingDownload) {
          return res.status(409).json({
            confirmationRequired: "confirmNoExistingDownload",
            error: INTERRUPTED_HANDOFF_MESSAGE,
          });
        }

        const assets = await getSeerrAssets(req.user!.id, currentGame.id);
        if (["owned", "playing", "completed"].includes(currentGame.status) || assets.length > 0) {
          return res.status(409).json({ error: "An available game cannot be cancelled." });
        }
        if (
          !(await storage.claimSeerrOperation(currentGame.id, {
            allowRecovery: confirmNoExistingDownload,
          }))
        ) {
          return res.status(409).json({
            error: "Another acquisition or cancellation operation is in progress.",
          });
        }

        try {
          const downloads = await storage.getDownloadsByGameId(currentGame.id);
          const terminalDownloadStatuses = new Set([
            "completed",
            "imported",
            "manual_review_required",
            "cancelled",
            "failed",
            "error",
          ]);
          const activeDownloads = downloads.filter(
            (download) => !terminalDownloadStatuses.has(download.status.toLowerCase())
          );
          if (
            currentGame.status === "downloading" &&
            activeDownloads.length === 0 &&
            !currentGame.seerrRecoveryRequired
          ) {
            return res.status(409).json({
              error:
                "Questarr reports an active download but cannot identify a tracked download to stop.",
            });
          }
          if (
            activeDownloads.some(
              (download) => download.seerrExternalRequestId !== externalRequestId.data
            )
          ) {
            return res.status(409).json({
              error:
                "An active download is not safely linked to this request. Stop it in the download client before cancelling.",
            });
          }
          if (
            activeDownloads.some((download) => download.downloadHash.startsWith("questarr-add-"))
          ) {
            return res.status(409).json({
              error:
                "The download client is still confirming this download. Try cancelling again after its tracking ID is available.",
            });
          }
          for (const download of activeDownloads) {
            const downloader = await storage.getDownloader(download.downloaderId);
            if (!downloader)
              return res
                .status(409)
                .json({ error: "The active download client is no longer configured." });
            const removed = await DownloaderManager.removeDownload(
              downloader,
              download.downloadHash,
              false
            );
            if (!removed.success)
              return res.status(502).json({ error: "The active download could not be cancelled." });
            await storage.updateGameDownloadStatus(
              download.id,
              "cancelled",
              "Cancelled through SeerrNG."
            );
          }
          await storage.finishSeerrOperation(currentGame.id, {
            status: "shelved",
            seerrCancelled: true,
            seerrRecoveryRequired: false,
            searchResultsAvailable: false,
          });
          return res.json(await getSeerrRequest(req.user!.id, externalRequestId.data));
        } finally {
          await storage.finishSeerrOperation(currentGame.id);
        }
      });
    } catch (error) {
      logger.error({ error }, "SeerrNG software request cancellation failed");
      return res.status(500).json({ error: "Request could not be cancelled." });
    }
  }
);

integrationRouter.get(
  "/seerrng/v1/requests/:externalRequestId/assets",
  async (req: Request, res: Response) => {
    const externalRequestId = seerrRequestIdSchema.safeParse(req.params.externalRequestId);
    if (!externalRequestId.success) return res.status(400).json({ error: "Invalid request ID." });
    const game = await findSeerrGame(req.user!.id, externalRequestId.data);
    if (!game) return res.status(404).json({ error: "Request not found." });
    try {
      const assets = await getSeerrAssets(req.user!.id, game.id);
      const bundleSupported = assets.length > 1;
      return res.json({
        assets: assets.map(({ id, name, size }) => ({
          id,
          name,
          size,
          url: `/api/integration/seerrng/v1/requests/${encodeURIComponent(externalRequestId.data)}/assets/${encodeURIComponent(id)}`,
        })),
        bundleSupported,
        ...(bundleSupported
          ? {
              bundleName: `${safeArchiveBaseName(game.title)}.tar.gz`,
              bundleUrl: `/api/integration/seerrng/v1/requests/${encodeURIComponent(externalRequestId.data)}/assets/bundle`,
            }
          : {}),
      });
    } catch (error) {
      logger.error({ error }, "SeerrNG software assets lookup failed");
      return res.status(500).json({ error: "Assets are unavailable." });
    }
  }
);

integrationRouter.get(
  "/seerrng/v1/requests/:externalRequestId/assets/bundle",
  async (req: Request, res: Response) => {
    const externalRequestId = seerrRequestIdSchema.safeParse(req.params.externalRequestId);
    if (!externalRequestId.success) return res.status(400).json({ error: "Invalid request ID." });
    const game = await findSeerrGame(req.user!.id, externalRequestId.data);
    if (!game) return res.status(404).json({ error: "Request not found." });

    const opened: Array<{
      name: string;
      handle: Awaited<ReturnType<typeof fs.open>>;
      stats: Stats;
      modifiedAt: Date;
    }> = [];
    try {
      const assets = await getSeerrAssets(req.user!.id, game.id);
      const config = await storage.getImportConfig(req.user!.id);
      const libraryRoot = await fs.realpath(config.libraryRoot);
      const usedNames = new Set<string>();
      for (const asset of assets) {
        try {
          const realPath = await fs.realpath(asset.path);
          if (!isContainedPath(realPath, libraryRoot)) continue;
          const handle = await fs.open(
            realPath,
            fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
          );
          const stat = await handle.stat();
          if (!stat.isFile()) {
            await handle.close();
            continue;
          }
          const entryName = safeArchiveEntryName(asset.name, opened.length, usedNames);
          opened.push({ name: entryName, handle, stats: stat, modifiedAt: stat.mtime });
        } catch {
          // Files removed or replaced while the bundle was being prepared are skipped.
        }
      }
      if (opened.length < 2) {
        await Promise.all(opened.map(({ handle }) => handle.close().catch(() => undefined)));
        return res
          .status(409)
          .json({ error: "At least two deliverable files are needed for a bundle." });
      }

      const safeTitle = safeArchiveBaseName(game.title);
      const filename = `${safeTitle}.tar.gz`;
      res.set({
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      const output = new TarArchive({ gzip: true, gzipOptions: { level: 1 } });
      output.on("error", (error: Error) => {
        logger.warn(
          { error, externalRequestId: externalRequestId.data },
          "SeerrNG bundle stream failed"
        );
        if (res.headersSent) res.destroy(error);
        else res.status(500).end();
      });
      res.on("close", () => {
        if (!res.writableEnded) output.abort();
      });
      output.pipe(res.status(200));
      for (const entry of opened) {
        output.append(entry.handle.createReadStream(), {
          name: entry.name,
          stats: entry.stats,
          date: entry.modifiedAt,
        });
      }
      void output.finalize().catch((error: unknown) => output.emit("error", error));
      return undefined;
    } catch (error) {
      await Promise.all(opened.map(({ handle }) => handle.close().catch(() => undefined)));
      logger.error(
        { error, externalRequestId: externalRequestId.data },
        "SeerrNG bundle could not be prepared"
      );
      if (res.headersSent) return res.destroy(error as Error);
      return res.status(500).json({ error: "Files could not be bundled." });
    }
  }
);

integrationRouter.get(
  "/seerrng/v1/requests/:externalRequestId/assets/:assetId",
  async (req: Request, res: Response) => {
    const externalRequestId = seerrRequestIdSchema.safeParse(req.params.externalRequestId);
    const assetId = z.string().min(1).max(256).safeParse(req.params.assetId);
    if (!externalRequestId.success || !assetId.success)
      return res.status(400).json({ error: "Invalid asset request." });
    const game = await findSeerrGame(req.user!.id, externalRequestId.data);
    if (!game) return res.status(404).json({ error: "Request not found." });
    try {
      const asset = (await getSeerrAssets(req.user!.id, game.id)).find(
        (item) => item.id === assetId.data
      );
      if (!asset) return res.status(404).json({ error: "Asset not found." });
      const size = asset.size;
      let start = 0;
      let end = size - 1;
      let statusCode = 200;
      const range = req.header("Range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || size === 0) {
          res.set("Content-Range", `bytes */${size}`);
          return res.status(416).end();
        }
        if (!match[1]) {
          const suffix = Number(match[2]);
          if (!suffix) {
            res.set("Content-Range", `bytes */${size}`);
            return res.status(416).end();
          }
          start = Math.max(0, size - suffix);
        } else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(size - 1, Number(match[2]));
        }
        if (!Number.isSafeInteger(start) || start < 0 || start >= size || end < start) {
          res.set("Content-Range", `bytes */${size}`);
          return res.status(416).end();
        }
        statusCode = 206;
        res.set("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      res.set({
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
      });
      const stream = createReadStream(asset.path, { start, end });
      stream.on("error", (error) => {
        logger.warn({ error }, "SeerrNG asset stream failed");
        if (!res.headersSent) res.status(404).end();
        else res.destroy(error);
      });
      return stream.pipe(res.status(statusCode));
    } catch (error) {
      logger.error({ error }, "SeerrNG software asset stream failed");
      return res.status(500).json({ error: "Asset could not be streamed." });
    }
  }
);

/** The library shape handed to external clients — a stable subset of Game. */
function toIntegrationGame(game: Game) {
  return {
    id: game.id,
    title: game.title,
    igdbId: game.igdbId,
    steamAppId: game.steamAppId,
    status: game.status,
    releaseStatus: game.releaseStatus,
    releaseDate: game.releaseDate,
    coverUrl: game.coverUrl,
    platforms: game.platforms ?? [],
    genres: game.genres ?? [],
    libraryPath: game.libraryPath,
    addedAt: game.addedAt,
  };
}

// ── Handshake ────────────────────────────────────────────────────────────────
// Lets an extension verify its URL and credential in one call before doing any
// real work, and surfaces the version pair in its own logs.
integrationRouter.get("/ping", (req: Request, res: Response) => {
  res.json({
    service: "questarr",
    version: APP_VERSION,
    apiVersion: INTEGRATION_API_VERSION,
    authenticatedAs: { id: req.user!.id, username: req.user!.username },
    usingApiKey: Boolean(req.apiKeyId),
  });
});

// ── Pull: Questarr library → external client ─────────────────────────────────
const libraryQuerySchema = z.object({
  // Rejects a malformed filter (e.g. "?status=,", "wanted,,owned", or an
  // unknown status) outright rather than silently degrading into "no filter"
  // or "matches nothing" — either of those would be a confusing way to fail.
  status: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()))
    .pipe(z.array(z.enum(GAME_STATUSES)).min(1))
    .optional(),
  includeHidden: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

integrationRouter.get("/library", async (req: Request, res: Response) => {
  try {
    const parsed = libraryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query parameters" });
    }
    const { status: statuses, includeHidden } = parsed.data;

    const games = await storage.getUserGames(req.user!.id, includeHidden, statuses);
    // Match /api/games' own behavior: a title the user filtered out (adult
    // content, age-restricted) must not leak through this endpoint either.
    const filterFlags = await getContentFilterFlags(req.user!.id);
    const visibleGames = excludeFilteredContent(games, filterFlags);
    return res.json({ games: visibleGames.map(toIntegrationGame), count: visibleGames.length });
  } catch (error) {
    logger.error({ error }, "Integration library fetch failed");
    return res.status(500).json({ error: "Failed to fetch library" });
  }
});

// ── Push: external library → Questarr ────────────────────────────────────────
const syncSchema = z.object({
  games: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        // Playnite's own game id, echoed back untouched so the extension can
        // correlate results with its library without re-matching by title.
        externalId: z.string().trim().max(200).optional(),
        installed: z.boolean().optional(),
        steamAppId: z.number().int().positive().optional(),
      })
    )
    .min(1)
    .max(MAX_SYNC_GAMES),
  // When true, a matched game that the client reports as installed is promoted
  // to "owned" in Questarr. Off by default: a sync should not rewrite library
  // state unless the user opted in.
  markInstalledAsOwned: z.boolean().optional().default(false),
});

integrationRouter.post(
  "/library/sync",
  validate(syncSchema),
  async (req: Request, res: Response) => {
    try {
      const parsed = syncSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid sync payload", issues: parsed.error.issues });
      }
      const { games: incoming, markInstalledAsOwned } = parsed.data;
      const userId = req.user!.id;

      const library = await storage.getUserGames(userId, true);

      // Index the library once; a sync can carry thousands of titles and a linear
      // scan per entry would make this quadratic.
      const byNormalizedTitle = new Map<string, Game>();
      const bySteamAppId = new Map<number, Game>();
      for (const game of library) {
        const key = normalizeTitle(game.title);
        if (!byNormalizedTitle.has(key)) byNormalizedTitle.set(key, game);
        if (game.steamAppId) bySteamAppId.set(game.steamAppId, game);
      }

      const matched: Array<{
        externalId?: string | undefined;
        title: string;
        gameId: string;
        status: string;
      }> = [];
      const unmatched: Array<{ externalId?: string | undefined; title: string }> = [];
      const promoted: string[] = [];

      for (const entry of incoming) {
        const match =
          (entry.steamAppId ? bySteamAppId.get(entry.steamAppId) : undefined) ??
          byNormalizedTitle.get(normalizeTitle(entry.title));

        if (!match) {
          unmatched.push({ externalId: entry.externalId, title: entry.title });
          continue;
        }

        let status = match.status;
        if (markInstalledAsOwned && entry.installed && match.status === "wanted") {
          await storage.updateGameStatus(match.id, { status: "owned" });
          status = "owned";
          promoted.push(match.id);
        }

        matched.push({
          externalId: entry.externalId,
          title: entry.title,
          gameId: match.id,
          status,
        });
      }

      logger.info(
        {
          userId,
          received: incoming.length,
          matched: matched.length,
          unmatched: unmatched.length,
          promoted: promoted.length,
        },
        "Integration library sync"
      );

      return res.json({
        received: incoming.length,
        matched,
        unmatched,
        promotedToOwned: promoted.length,
      });
    } catch (error) {
      logger.error({ error }, "Integration library sync failed");
      return res.status(500).json({ error: "Library sync failed" });
    }
  }
);

// ── Request a game from the couch ────────────────────────────────────────────
// Matches a free-text title against IGDB and adds it to the library. Adding it
// as "wanted" is what hands it to the existing auto-search pipeline, which
// searches indexers and sends the best release to the download client — so a
// single call from Playnite is enough to start a download.
const requestSchema = z.object({
  title: z.string().trim().min(1).max(500),
  status: z.enum(["wanted", "owned"]).optional().default("wanted"),
});

integrationRouter.post(
  "/games/request",
  validate(requestSchema),
  async (req: Request, res: Response) => {
    try {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request payload", issues: parsed.error.issues });
      }
      const { title, status } = parsed.data;
      const userId = req.user!.id;

      // Shared with POST /api/games/match-and-add (the browser's own "quick
      // add" flow) so the two entry points can't drift on matching, content
      // filtering, or dedupe behavior.
      const result = await quickAddGameByTitle(userId, title, { status, source: "api" });

      switch (result.outcome) {
        case "not_found":
          // Deliberately indistinguishable from "no match": a filtered title
          // must not be discoverable through this endpoint either.
          return res.status(404).json({ error: "No game found on IGDB for this title" });
        case "duplicate":
          return res
            .status(409)
            .json({ error: "Game already in collection", game: toIntegrationGame(result.game) });
        case "added":
          logger.info(
            {
              userId,
              title: result.game.title,
              igdbId: result.game.igdbId,
              viaApiKey: Boolean(req.apiKeyId),
            },
            "Game requested through the integration API"
          );
          return res.status(201).json({ game: toIntegrationGame(result.game) });
      }

      return;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      logger.error({ error }, "Integration game request failed");
      return res.status(500).json({ error: "Failed to request game" });
    }
  }
);
