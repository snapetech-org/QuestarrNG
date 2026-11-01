import {
  serviceMessage,
  ServiceMessageError,
  serviceErrorResult,
} from "../shared/service-messages.js";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { safeFetch } from "./ssrf.js";

const API_BASE = "https://api.rawg.io/api";
const REQUEST_INTERVAL_MS = 2100;
const MAX_PENDING_REQUESTS = 30;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
// The cache is process-local; a per-process key avoids an unkeyed digest of credentials.
const CACHE_KEY_SECRET = randomBytes(32);

const entitySchema = z.object({ id: z.number().int().positive(), name: z.string() }).passthrough();
const rawgGameSchema = z
  .object({
    id: z.number().int().positive(),
    slug: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    description_raw: z.string().optional().nullable(),
    released: z.string().optional().nullable(),
    background_image: z.string().url().optional().nullable(),
    rating: z.number().min(0).max(5).optional().nullable(),
    metacritic: z.number().optional().nullable(),
    platforms: z.array(z.object({ platform: entitySchema }).passthrough()).optional(),
    genres: z.array(entitySchema).optional(),
    developers: z.array(entitySchema).optional(),
    publishers: z.array(entitySchema).optional(),
    esrb_rating: entitySchema.optional().nullable(),
    tags: z.array(entitySchema).optional(),
  })
  .passthrough();
export type RawgGame = z.infer<typeof rawgGameSchema>;
const listSchema = z.object({
  results: z.array(rawgGameSchema),
  next: z.string().url().nullable().optional(),
});

let nextRequestAt = 0;
let pendingRequests = 0;
let requestTail: Promise<void> = Promise.resolve();
const cache = new Map<string, { expiresAt: number; games: RawgGame[] }>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(url: URL): string {
  return createHmac("sha256", CACHE_KEY_SECRET)
    .update(url.pathname + url.search)
    .digest("hex");
}

async function queueRequest<T>(request: () => Promise<T>): Promise<T> {
  if (pendingRequests >= MAX_PENDING_REQUESTS) {
    throw new ServiceMessageError("service.rawg_busy", {});
  }
  pendingRequests += 1;
  const queued = requestTail.then(async () => {
    try {
      const waitMs = Math.max(0, nextRequestAt - Date.now());
      if (waitMs) await sleep(waitMs);
      nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
      return await request();
    } finally {
      pendingRequests -= 1;
    }
  });
  requestTail = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

async function requestGames(
  apiKey: string,
  params: Record<string, string | number>
): Promise<RawgGame[]> {
  const url = new URL("/api/games", API_BASE);
  url.searchParams.set("key", apiKey);
  url.searchParams.set(
    "page_size",
    String(Math.min(40, Math.max(1, Number(params.page_size ?? 20))))
  );
  for (const [name, value] of Object.entries(params)) {
    if (name !== "page_size") url.searchParams.set(name, String(value));
  }
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.games;

  return queueRequest(async () => {
    let response: Response;
    try {
      response = await safeFetch(url.href, {
        allowPrivate: false,
        requireHttps: true,
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      // Fetch errors can embed the request URL. RAWG authenticates with a
      // query parameter, so do not propagate upstream error text or URLs.
      throw new ServiceMessageError("service.rawg_connect_failed", {});
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        throw new ServiceMessageError("service.rawg_key_rejected", {});
      }
      if (response.status === 429) throw new ServiceMessageError("service.rawg_rate_limit", {});
      throw new ServiceMessageError("service.rawg_http_error", { status: response.status });
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new ServiceMessageError("service.rawg_size_limit", {});
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    let games: RawgGame[];
    try {
      games = listSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).results;
    } catch {
      throw new ServiceMessageError("service.rawg_list_invalid", {});
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, games });
    return games;
  });
}

export function formatRawgGame(game: RawgGame): Record<string, unknown> {
  const released = game.released && /^\d{4}-\d{2}-\d{2}$/.test(game.released) ? game.released : "";
  const releaseDate = released && !Number.isNaN(Date.parse(released)) ? released : "";
  const adultRating = /^(mature|adults-only)$/i.test(game.esrb_rating?.name ?? "");
  const summary = (game.description_raw ?? game.description ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
  return {
    id: `rawg-${game.id}`,
    rawgId: game.id,
    rawgSlug: game.slug ?? String(game.id),
    igdbId: null,
    title: game.name,
    summary,
    coverUrl: game.background_image ?? "",
    releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    rating: game.rating == null ? null : Math.round(game.rating * 20) / 10,
    aggregatedRating: game.metacritic ?? undefined,
    platforms: game.platforms?.map(({ platform }) => platform.name) ?? [],
    platformOptions: [],
    genres: game.genres?.map(({ name }) => name) ?? [],
    themes: [],
    developers: game.developers?.map(({ name }) => name) ?? [],
    publishers: game.publishers?.map(({ name }) => name) ?? [],
    isAdultContent: game.tags?.some(({ name }) => /sexual|erotic/i.test(name)) ?? false,
    isAgeRestricted: adultRating,
    screenshots: [],
    igdbWebsites: [],
    status: null,
    isReleased: releaseDate !== "" && Date.parse(releaseDate) <= Date.now(),
    earlyAccess: false,
    source: "rawg",
  };
}

export const rawgClient = {
  async testCredentials(apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
      await requestGames(apiKey, { page_size: 1 });
      return { success: true, ...serviceMessage("interface.rawg_api_key_is_valid_5d4211bd", {}) };
    } catch (error) {
      return serviceErrorResult(error, serviceMessage("service.rawg_request_failed", {}));
    }
  },
  async search(apiKey: string, query: string, limit = 20) {
    if (!query.trim()) return [];
    return (
      await requestGames(apiKey, { search: query.trim().slice(0, 120), page_size: limit })
    ).map(formatRawgGame);
  },
  async popular(apiKey: string, limit = 20) {
    return (await requestGames(apiKey, { ordering: "-added", page_size: limit })).map(
      formatRawgGame
    );
  },
  async recent(apiKey: string, limit = 20) {
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    const start = startDate.toISOString().slice(0, 10);
    return (
      await requestGames(apiKey, {
        dates: `${start},${end}`,
        ordering: "-released",
        page_size: limit,
      })
    ).map(formatRawgGame);
  },
  async upcoming(apiKey: string, limit = 20) {
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return (
      await requestGames(apiKey, {
        dates: `${today},${end}`,
        ordering: "released",
        page_size: limit,
      })
    ).map(formatRawgGame);
  },
  clearCache() {
    cache.clear();
  },
};
