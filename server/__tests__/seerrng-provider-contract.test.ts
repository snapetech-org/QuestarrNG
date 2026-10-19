import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request } from "express";
import type { Server } from "node:http";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { load as loadYaml } from "js-yaml";

const mocks = vi.hoisted(() => ({
  storage: {
    getIntegrationRequest: vi.fn(),
    addIntegrationRequest: vi.fn(),
    updateIntegrationRequest: vi.fn(),
    getGame: vi.fn(),
    getUserGames: vi.fn(),
    getGameFiles: vi.fn(),
    getImportConfig: vi.fn(),
    getDownloadsByGameId: vi.fn(),
    getUserGamesByIgdbIds: vi.fn(),
    getUser: vi.fn(),
    updateGame: vi.fn(),
    claimSeerrOperation: vi.fn(),
    finishSeerrOperation: vi.fn(),
    getDownloader: vi.fn(),
    updateGameDownloadStatus: vi.fn(),
  },
  igdb: {
    formatGameData: vi.fn(),
    searchGames: vi.fn(),
    searchCatalogPage: vi.fn(),
    getPopularGames: vi.fn(),
    getPlatforms: vi.fn(),
    getGameById: vi.fn(),
    getGameByIdForPlatform: vi.fn(),
    getTimeToBeats: vi.fn(),
  },
  getSteamOwnership: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mocks.logger),
  },
  checkAutoSearch: vi.fn(),
  removeDownload: vi.fn(),
  quickAddGameByTitle: vi.fn(),
}));

vi.mock("../storage.js", () => ({ storage: mocks.storage }));
vi.mock("../igdb.js", () => ({
  igdbClient: mocks.igdb,
  matchesCatalogMetadataFilters: (
    game: { genres?: Array<{ name?: string }>; first_release_date?: number },
    filters: { genre?: string; releaseYear?: number }
  ) => {
    const genreMatches =
      !filters.genre ||
      game.genres?.some((genre) => genre.name?.toLowerCase() === filters.genre?.toLowerCase());
    const yearMatches =
      filters.releaseYear === undefined ||
      (game.first_release_date !== undefined &&
        new Date(game.first_release_date * 1000).getUTCFullYear() === filters.releaseYear);
    return Boolean(genreMatches && yearMatches);
  },
}));
vi.mock("../cron.js", () => ({
  checkAutoSearch: mocks.checkAutoSearch,
  withGameOperationLock: async (_gameId: string, work: () => Promise<unknown>) => work(),
}));
vi.mock("../downloaders/manager.js", () => ({
  DownloaderManager: { removeDownload: mocks.removeDownload },
}));
vi.mock("../game-quick-add.js", () => ({ quickAddGameByTitle: mocks.quickAddGameByTitle }));
vi.mock("../logger.js", () => ({
  logger: mocks.logger,
  routesLogger: mocks.logger,
  expressLogger: mocks.logger,
  middlewareLogger: mocks.logger,
}));
vi.mock("../steam.js", () => ({
  steamService: { getOwnedGameAppIds: mocks.getSteamOwnership },
}));
vi.mock("../config.js", () => ({ config: { steam: { apiKey: "steam-test-key" } } }));
vi.mock("../content-filter.js", () => ({
  getContentFilterFlags: async () => ({ hideAdultContent: false }),
  excludeFilteredContent: (
    games: Array<{ isAdultContent?: boolean }>,
    flags: { hideAdultContent?: boolean }
  ) => (flags.hideAdultContent ? games.filter((game) => !game.isAdultContent) : games),
}));

import { integrationRouter } from "../routes/integration.js";

const USER = { id: "user-1", username: "tester" };
const REQUEST_ID = "questarr-request-1";
const USER_VARIANT = { operatingSystem: "linux", architecture: "x64" };

const startTestServer = (app: express.Express) =>
  new Promise<Server>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });

type TestGame = {
  id: string;
  userId: string;
  title: string;
  igdbId: number;
  status: string;
  platforms: Array<{ id: number; name?: string }>;
  genres: string[];
  coverUrl: string;
  releaseDate: string;
  releaseStatus: string;
  seerrExternalRequestId?: string;
  seerrVariant?: typeof USER_VARIANT;
  seerrCancelled?: boolean;
  seerrRecoveryRequired?: boolean;
  seerrDispatching?: boolean;
  searchResultsAvailable?: boolean;
  isAdultContent?: boolean;
};

function makeGame(overrides: Partial<TestGame> = {}): TestGame {
  return {
    id: "game-1",
    userId: USER.id,
    title: "Test Game",
    igdbId: 42,
    status: "wanted",
    platforms: [],
    genres: [],
    coverUrl: "",
    releaseDate: "",
    releaseStatus: "released",
    seerrExternalRequestId: REQUEST_ID,
    seerrVariant: USER_VARIANT,
    ...overrides,
  };
}

describe("SeerrNG software-provider contract", () => {
  let app: Server;
  let games: TestGame[];
  let ledger: Record<string, unknown> | undefined;
  let gameFiles: Array<Record<string, unknown>>;
  let downloads: Array<Record<string, unknown>>;
  let libraryRoot: string;

  const addLinkedGame = (game = makeGame(), externalRequestId = REQUEST_ID) => {
    game.seerrExternalRequestId = externalRequestId;
    games = [game];
    ledger = {
      userId: USER.id,
      externalRequestId,
      title: game.title,
      operatingSystem: USER_VARIANT.operatingSystem,
      architecture: USER_VARIANT.architecture,
      gameId: game.id,
      status: "searching",
      errorMessage: null,
    };
    return game;
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "questarr-provider-library-"));
    games = [];
    ledger = undefined;
    gameFiles = [];
    downloads = [];

    mocks.storage.getIntegrationRequest.mockImplementation(
      async (_userId: string, externalRequestId: string) =>
        ledger?.externalRequestId === externalRequestId ? ledger : undefined
    );
    mocks.storage.addIntegrationRequest.mockImplementation(
      async (value: Record<string, unknown>) => {
        ledger = {
          id: "ledger-1",
          status: "accepted",
          errorMessage: null,
          gameId: null,
          downloadId: null,
          ...value,
        };
        return ledger;
      }
    );
    mocks.storage.updateIntegrationRequest.mockImplementation(
      async (_userId: string, _externalRequestId: string, values: Record<string, unknown>) => {
        if (ledger) ledger = { ...ledger, ...values };
        return ledger;
      }
    );
    mocks.storage.getGame.mockImplementation(async (id: string) =>
      games.find((game) => game.id === id)
    );
    mocks.storage.getUserGames.mockImplementation(async () => games);
    mocks.storage.getGameFiles.mockImplementation(async (gameId: string) =>
      gameFiles.filter((file) => file.gameId === gameId)
    );
    mocks.storage.getImportConfig.mockImplementation(async () => ({ libraryRoot }));
    mocks.storage.getDownloadsByGameId.mockImplementation(async () => downloads);
    mocks.storage.getUserGamesByIgdbIds.mockImplementation(async (_userId: string, ids: number[]) =>
      games.filter((game) => ids.includes(game.igdbId))
    );
    mocks.storage.getUser.mockResolvedValue({ steamId64: "76561198000000000" });
    mocks.getSteamOwnership.mockResolvedValue(new Set([570]));
    mocks.storage.updateGame.mockImplementation(async (id: string, values: Partial<TestGame>) => {
      const game = games.find((item) => item.id === id);
      if (game) Object.assign(game, values);
      return game;
    });
    mocks.storage.claimSeerrOperation.mockResolvedValue(true);
    mocks.storage.finishSeerrOperation.mockImplementation(
      async (id: string, values?: Partial<TestGame>) => {
        const game = games.find((item) => item.id === id);
        if (game && values) Object.assign(game, values);
      }
    );
    mocks.storage.getDownloader.mockResolvedValue({ id: "downloader-1", type: "qbittorrent" });
    mocks.storage.updateGameDownloadStatus.mockResolvedValue(undefined);
    mocks.igdb.formatGameData.mockImplementation((game) => game);
    mocks.igdb.searchGames.mockResolvedValue([]);
    mocks.igdb.searchCatalogPage.mockResolvedValue({ results: [], cursor: null });
    mocks.igdb.getPopularGames.mockResolvedValue([]);
    mocks.igdb.getPlatforms.mockResolvedValue([]);
    mocks.igdb.getGameById.mockResolvedValue(undefined);
    mocks.igdb.getTimeToBeats.mockResolvedValue(new Map());
    mocks.checkAutoSearch.mockResolvedValue(undefined);
    mocks.removeDownload.mockResolvedValue({ success: true });
    mocks.quickAddGameByTitle.mockImplementation(
      async (_userId: string, title: string, options: Record<string, unknown>) => {
        const game = makeGame({
          id: `game-${games.length + 1}`,
          title,
          status: String(options.status ?? "wanted"),
          seerrExternalRequestId: String(options.seerrExternalRequestId ?? REQUEST_ID),
          seerrVariant: (options.seerrVariant as typeof USER_VARIANT | undefined) ?? USER_VARIANT,
        });
        games.push(game);
        return { outcome: "added", game };
      }
    );

    const testApp = express();
    testApp.use(express.json());
    testApp.use((req: Request, _res, next) => {
      req.user = USER as never;
      next();
    });
    testApp.use("/api/integration", integrationRouter);
    app = await startTestServer(testApp);
  });

  afterEach(async () => {
    if (app.listening) {
      await new Promise<void>((resolve, reject) => {
        app.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await fs.rm(libraryRoot, { recursive: true, force: true });
  });

  it("returns the versioned handshake and normalizes catalog search results", async () => {
    const ping = await request(app).get("/api/integration/seerrng/v1/ping");
    expect(ping.status).toBe(200);
    expect(ping.headers["cache-control"]).toBe("no-store");
    expect(ping.body).toEqual({
      service: "QuestarrNG",
      version: expect.any(String),
      apiVersion: 1,
      requestContractVersion: 2,
      capabilities: {
        catalog: true,
        pcAcquisition: true,
        emulationAcquisition: false,
        requestActions: { retry: true, cancel: true },
        assetStreaming: true,
        assetBundles: true,
        editions: true,
        discover: true,
        wantedContent: true,
      },
    });

    const openApiText = await fs.readFile(
      path.resolve(process.cwd(), "docs/contracts/seerrng-v2.openapi.yaml"),
      "utf8"
    );
    const contract = loadYaml(openApiText) as {
      openapi: string;
      info: { version: string };
      paths: Record<string, Record<string, unknown>>;
      components: {
        schemas: {
          Handshake: {
            properties: {
              service: { const: string };
              requestContractVersion: { const: number };
            };
          };
        };
      };
    };
    expect(contract.openapi).toBe("3.1.0");
    expect(contract.info.version).toBe(String(ping.body.requestContractVersion));
    expect(ping.body.service).toBe(contract.components.schemas.Handshake.properties.service.const);
    expect(ping.body.requestContractVersion).toBe(
      contract.components.schemas.Handshake.properties.requestContractVersion.const
    );
    for (const [route, definition] of Object.entries(contract.paths)) {
      const pathParameters =
        (definition.parameters as Array<{ in: string; name: string }> | undefined)
          ?.filter((parameter) => parameter.in === "path")
          .map((parameter) => parameter.name) ?? [];
      const operationParameters = Object.values(definition)
        .filter(
          (operation): operation is { parameters: Array<{ in: string; name: string }> } =>
            typeof operation === "object" && operation !== null && "parameters" in operation
        )
        .flatMap((operation) => operation.parameters)
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name);
      const declared = new Set([...pathParameters, ...operationParameters]);
      for (const [, name] of route.matchAll(/\{([^}]+)\}/g)) {
        expect(declared.has(name)).toBe(true);
      }
    }

    const httpMethods = new Set([
      "get",
      "put",
      "post",
      "delete",
      "options",
      "head",
      "patch",
      "trace",
    ]);
    const runtimeRoutes = (
      integrationRouter as unknown as {
        stack: Array<{
          route?: {
            path: string;
            methods: Record<string, boolean>;
          };
        }>;
      }
    ).stack.flatMap(({ route }) => {
      if (!route || !route.path.startsWith("/seerrng/v1/")) return [];
      return [
        {
          path: route.path.replace(/^\/seerrng\/v1/, "").replace(/:([A-Za-z0-9_]+)/g, "{$1}"),
          methods: Object.keys(route.methods).filter((method) => route.methods[method]),
        },
      ];
    });
    const documentedRoutes = Object.entries(contract.paths).flatMap(([route, definition]) => [
      {
        path: route,
        methods: Object.keys(definition).filter((method) => httpMethods.has(method)),
      },
    ]);
    const sortRoutes = (routes: typeof runtimeRoutes) =>
      routes
        .map(({ path: route, methods }) => ({
          path: route,
          methods: [...methods].sort(),
        }))
        .sort((left, right) => left.path.localeCompare(right.path));
    expect(sortRoutes(runtimeRoutes)).toEqual(sortRoutes(documentedRoutes));

    mocks.igdb.searchGames.mockResolvedValueOnce([
      {
        igdbId: 8,
        title: "  Example ",
        summary: undefined,
        coverUrl: null,
        platforms: "invalid",
        platformOptions: ["PC"],
        genres: undefined,
      },
    ]);
    const search = await request(app)
      .get("/api/integration/seerrng/v1/catalog/search")
      .query({ q: "  Example  ", limit: 7 });
    expect(search.status).toBe(200);
    expect(search.body[0]).toEqual({
      id: "igdb-8",
      igdbId: 8,
      title: "  Example ",
      summary: "",
      coverUrl: "",
      releaseDate: "",
      steamAppId: null,
      platforms: [],
      platformOptions: ["PC"],
      genres: [],
      timeToBeat: null,
    });
    expect(mocks.igdb.searchGames).toHaveBeenCalledWith("Example", 7);

    expect(
      (await request(app).get("/api/integration/seerrng/v1/catalog/search").query({ q: " " }))
        .status
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/integration/seerrng/v1/catalog/search")
          .query({ q: "a", limit: 51 })
      ).status
    ).toBe(400);
    mocks.igdb.searchGames.mockRejectedValueOnce(new Error("IGDB down"));
    expect(
      (await request(app).get("/api/integration/seerrng/v1/catalog/search").query({ q: "a" }))
        .status
    ).toBe(502);
  });

  it("validates cursors, limits, platform lists, and metadata filters", async () => {
    const searchPage = (query: Record<string, string | number>) =>
      request(app).get("/api/integration/seerrng/v1/catalog/search-page").query(query);
    expect((await searchPage({ q: "" })).status).toBe(400);
    expect((await searchPage({ q: "Zelda", limit: 0 })).status).toBe(400);
    expect((await searchPage({ q: "Zelda", platformIds: "0" })).status).toBe(400);
    expect((await searchPage({ q: "Zelda", platformIds: "1,1,2" })).status).toBe(200);
    expect(mocks.igdb.searchCatalogPage).toHaveBeenLastCalledWith(
      "Zelda",
      20,
      undefined,
      [1, 2],
      {}
    );
    expect((await searchPage({ q: "Zelda", genre: " " })).status).toBe(400);
    expect((await searchPage({ q: "Zelda", releaseYear: 1800 })).status).toBe(400);
    expect((await searchPage({ q: "Zelda", cursor: "%%%" })).status).toBe(400);

    mocks.igdb.searchCatalogPage.mockRejectedValueOnce(new Error("search unavailable"));
    expect((await searchPage({ q: "Zelda" })).status).toBe(502);
  });

  it("covers popular games, platforms, detail lookup, and their provider errors", async () => {
    mocks.igdb.getPopularGames.mockResolvedValueOnce([{ igdbId: 2, title: "Popular" }]);
    expect((await request(app).get("/api/integration/seerrng/v1/catalog/popular")).status).toBe(
      200
    );
    expect(
      (await request(app).get("/api/integration/seerrng/v1/catalog/popular").query({ limit: 0 }))
        .status
    ).toBe(400);
    mocks.igdb.getPopularGames.mockRejectedValueOnce(new Error("catalog offline"));
    expect((await request(app).get("/api/integration/seerrng/v1/catalog/popular")).status).toBe(
      502
    );

    expect((await request(app).get("/api/integration/seerrng/v1/catalog/platforms")).status).toBe(
      200
    );
    mocks.igdb.getPlatforms.mockRejectedValueOnce(new Error("platforms offline"));
    expect((await request(app).get("/api/integration/seerrng/v1/catalog/platforms")).status).toBe(
      502
    );

    expect((await request(app).get("/api/integration/seerrng/v1/catalog/games/0")).status).toBe(
      400
    );
    expect(
      (await request(app).get("/api/integration/seerrng/v1/catalog/games/42?platformId=0")).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/integration/seerrng/v1/catalog/games/42")
          .query({ platformId: [48, 49] })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/integration/seerrng/v1/catalog/games/42")
          .query({ platformId: "1e2" })
      ).status
    ).toBe(400);
    expect((await request(app).get("/api/integration/seerrng/v1/catalog/games/999")).status).toBe(
      404
    );
    mocks.igdb.getGameById.mockResolvedValueOnce({
      igdbId: 42,
      title: "Details",
      rating: 90,
      publishers: Array.from({ length: 22 }, (_, id) => `publisher-${id}`),
      developers: ["Studio"],
      screenshots: Array.from({ length: 15 }, (_, id) => `shot-${id}`),
      videos: [
        null,
        { video_id: "abcdefghijk", name: "Trailer" },
        { video_id: "invalid", name: "Bad" },
        { video_id: "12345678901" },
      ],
    });
    const detail = await request(app).get("/api/integration/seerrng/v1/catalog/games/42");
    expect(detail.status).toBe(200);
    expect(detail.body.publishers).toHaveLength(20);
    expect(detail.body.screenshots).toHaveLength(12);
    expect(detail.body.videos).toEqual([
      { name: "Trailer", videoId: "abcdefghijk" },
      { name: "", videoId: "12345678901" },
    ]);
    expect(detail.body.rating).toBe(90);
    expect(detail.body.timeToBeat).toBeNull();
    mocks.igdb.getGameByIdForPlatform.mockResolvedValueOnce({
      igdbId: 42,
      title: "Details",
      platformReleaseDate: "2026-10-12",
    });
    const platformDetail = await request(app)
      .get("/api/integration/seerrng/v1/catalog/games/42")
      .query({ platformId: 48 });
    expect(platformDetail.status).toBe(200);
    expect(platformDetail.body.platformReleaseDate).toBe("2026-10-12");
    expect(mocks.igdb.getGameByIdForPlatform).toHaveBeenCalledWith(42, 48, true);
    mocks.igdb.getGameById.mockRejectedValueOnce(new Error("IGDB error"));
    expect((await request(app).get("/api/integration/seerrng/v1/catalog/games/42")).status).toBe(
      502
    );
  });

  it("looks up visible library games and handles invalid IDs or storage failures", async () => {
    const game = makeGame({ isAdultContent: false });
    games = [game];
    const response = await request(app)
      .get("/api/integration/seerrng/v1/library/lookup")
      .query({ igdbIds: "42,42" });
    expect(response.status).toBe(200);
    expect(response.body.games).toEqual([{ igdbId: 42, status: "wanted", deliverable: false }]);
    expect(
      (await request(app).get("/api/integration/seerrng/v1/library/lookup").query({ igdbIds: "" }))
        .status
    ).toBe(400);
    mocks.storage.getUserGamesByIgdbIds.mockRejectedValueOnce(new Error("storage failed"));
    expect(
      (
        await request(app)
          .get("/api/integration/seerrng/v1/library/lookup")
          .query({ igdbIds: "42" })
      ).status
    ).toBe(500);
  });

  it("reports verified Steam ownership separately from Questarr library status", async () => {
    const response = await request(app)
      .get("/api/integration/seerrng/v1/library/lookup")
      .query({ igdbIds: "42", steamAppIds: "570,440" });

    expect(response.status).toBe(200);
    expect(response.body.steamGames).toEqual([
      { steamAppId: 570, owned: true },
      { steamAppId: 440, owned: false },
    ]);
    expect(mocks.getSteamOwnership).toHaveBeenCalledWith("steam-test-key", "76561198000000000");
  });

  it("creates idempotent software requests and reports acquisition-search results", async () => {
    const invalid = await request(app)
      .post("/api/integration/seerrng/v1/requests")
      .send({ title: "" });
    expect(invalid.status).toBe(400);

    mocks.quickAddGameByTitle.mockResolvedValueOnce({ outcome: "not_found" });
    const notFound = await request(app)
      .post("/api/integration/seerrng/v1/requests")
      .send({ externalRequestId: REQUEST_ID, title: "Missing Game", variant: USER_VARIANT });
    expect(notFound.status).toBe(404);
    expect(ledger).toMatchObject({
      status: "failed",
      errorMessage: "No matching PC game was found.",
    });

    ledger = undefined;
    mocks.quickAddGameByTitle.mockResolvedValueOnce({ outcome: "duplicate" });
    const duplicate = await request(app).post("/api/integration/seerrng/v1/requests").send({
      externalRequestId: "request-duplicate",
      title: "Duplicate Game",
      variant: USER_VARIANT,
    });
    expect(duplicate.status).toBe(409);

    ledger = undefined;
    mocks.checkAutoSearch.mockImplementationOnce(async () => {
      const game = games.find((candidate) => candidate.id === "game-1");
      if (game) game.searchResultsAvailable = true;
    });
    const created = await request(app).post("/api/integration/seerrng/v1/requests").send({
      externalRequestId: "request-created",
      title: "New Game",
      igdbId: 42,
      variant: USER_VARIANT,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      externalRequestId: "request-created",
      status: "searching",
    });
    expect(mocks.quickAddGameByTitle).toHaveBeenLastCalledWith(
      USER.id,
      "New Game",
      expect.objectContaining({ igdbId: 42, seerrExternalRequestId: "request-created" })
    );
    expect(mocks.checkAutoSearch).toHaveBeenCalledWith({
      userId: USER.id,
      gameId: "game-1",
      force: true,
    });

    const sameRequest = await request(app).post("/api/integration/seerrng/v1/requests").send({
      externalRequestId: "request-created",
      title: "New Game",
      igdbId: 42,
      variant: USER_VARIANT,
    });
    expect(sameRequest.status).toBe(200);
    const changedIdentity = await request(app).post("/api/integration/seerrng/v1/requests").send({
      externalRequestId: "request-created",
      title: "New Game",
      igdbId: 43,
      variant: USER_VARIANT,
    });
    expect(changedIdentity.status).toBe(409);
    const changedRequest = await request(app).post("/api/integration/seerrng/v1/requests").send({
      externalRequestId: "request-created",
      title: "Other Game",
      igdbId: 42,
      variant: USER_VARIANT,
    });
    expect(changedRequest.status).toBe(409);
  });

  it("handles an existing ledger, legacy request, and create failures", async () => {
    const linked = addLinkedGame();
    const mismatchedId = await request(app).post("/api/integration/seerrng/v1/requests").send({
      externalRequestId: REQUEST_ID,
      title: linked.title,
      igdbId: 99,
      variant: USER_VARIANT,
    });
    expect(mismatchedId.status).toBe(409);

    ledger = undefined;
    games = [makeGame()];
    const legacy = await request(app)
      .post("/api/integration/seerrng/v1/requests")
      .send({ externalRequestId: REQUEST_ID, title: "Test Game", variant: USER_VARIANT });
    expect(legacy.status).toBe(200);
    expect(mocks.storage.updateIntegrationRequest).toHaveBeenCalledWith(USER.id, REQUEST_ID, {
      gameId: "game-1",
    });

    ledger = undefined;
    games = [];
    mocks.storage.addIntegrationRequest.mockRejectedValueOnce(new Error("database unavailable"));
    const failure = await request(app)
      .post("/api/integration/seerrng/v1/requests")
      .send({ externalRequestId: "request-error", title: "Broken", variant: USER_VARIANT });
    expect(failure.status).toBe(500);
  });

  it("returns request status for ledger-only and linked game states", async () => {
    ledger = {
      userId: USER.id,
      externalRequestId: REQUEST_ID,
      title: "Awaiting match",
      operatingSystem: "linux",
      architecture: "x64",
      status: "failed",
      errorMessage: "No match",
      gameId: null,
    };
    const ledgerOnly = await request(app).get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}`);
    expect(ledgerOnly.status).toBe(200);
    expect(ledgerOnly.body).toMatchObject({
      status: "failed",
      actions: { retry: true, cancel: false },
    });

    ledger = undefined;
    expect((await request(app).get("/api/integration/seerrng/v1/requests/missing")).status).toBe(
      404
    );
    expect(
      (await request(app).get(`/api/integration/seerrng/v1/requests/${"x".repeat(256)}`)).status
    ).toBe(400);

    const states: Array<[Partial<TestGame>, string, string?]> = [
      [{ seerrCancelled: true }, "cancelled"],
      [{ status: "owned" }, "available"],
      [{ seerrRecoveryRequired: true }, "failed"],
      [{}, "importing", "manual_review_required"],
      [{}, "downloading", "paused"],
      [{}, "failed", "error"],
      [{ status: "downloading" }, "downloading"],
      [{ seerrDispatching: true }, "searching"],
      [{ searchResultsAvailable: true }, "searching"],
      [{ status: "wanted" }, "failed"],
      [{ status: "unknown" }, "accepted"],
    ];
    for (const [overrides, expected, downloadStatus] of states) {
      const game = addLinkedGame(makeGame(overrides));
      downloads = downloadStatus ? [{ id: "download-1", status: downloadStatus }] : [];
      const status = await request(app).get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}`);
      expect(status.status).toBe(200);
      expect(status.body.status).toBe(expected);
      if (expected === "failed" && overrides.seerrRecoveryRequired) {
        expect(status.body.error).toMatch(/Questarr restarted/);
      }
      if (expected === "available") expect(status.body.actions.cancel).toBe(false);
      expect(game.id).toBe("game-1");
    }
  });

  it("retries failed requests with confirmation, state checks, and recovery", async () => {
    expect(
      (
        await request(app)
          .post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)
          .send({ confirmNoExistingDownload: "yes" })
      ).status
    ).toBe(400);
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/missing/retry`)).status
    ).toBe(404);

    addLinkedGame(makeGame({ seerrCancelled: true }));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)).status
    ).toBe(409);
    addLinkedGame(makeGame({ seerrDispatching: true }));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)).status
    ).toBe(409);
    addLinkedGame(makeGame({ seerrRecoveryRequired: true }));
    const confirmation = await request(app).post(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`
    );
    expect(confirmation.status).toBe(409);
    expect(confirmation.body.confirmationRequired).toBe("confirmNoExistingDownload");
    addLinkedGame(makeGame({ status: "owned" }));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)).status
    ).toBe(409);

    const game = addLinkedGame(makeGame());
    const retried = await request(app).post(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`
    );
    expect(retried.status).toBe(200);
    expect(game.status).toBe("wanted");
    expect(mocks.checkAutoSearch).toHaveBeenCalled();

    ledger = undefined;
    games = [];
    mocks.storage.getIntegrationRequest.mockRejectedValueOnce(new Error("database failure"));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)).status
    ).toBe(500);
  });

  it("recovers ledger-only requests during retry and records failed matching", async () => {
    ledger = {
      userId: USER.id,
      externalRequestId: REQUEST_ID,
      title: "Recover me",
      operatingSystem: "linux",
      architecture: "x64",
      gameId: null,
      status: "failed",
      errorMessage: "prior error",
    };
    mocks.quickAddGameByTitle.mockResolvedValueOnce({ outcome: "not_found" });
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)).status
    ).toBe(404);
    expect(ledger).toMatchObject({
      status: "failed",
      errorMessage: "No matching PC game was found.",
    });

    mocks.quickAddGameByTitle.mockResolvedValueOnce({ outcome: "duplicate" });
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/retry`)).status
    ).toBe(409);
  });

  it("cancels safely and reports every active-download conflict", async () => {
    expect(
      (
        await request(app)
          .post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)
          .send({ confirmNoExistingDownload: 1 })
      ).status
    ).toBe(400);
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/missing/cancel`)).status
    ).toBe(404);

    addLinkedGame(makeGame({ seerrCancelled: true }));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(200);
    addLinkedGame(makeGame({ seerrRecoveryRequired: true }));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);
    addLinkedGame(makeGame({ status: "completed" }));
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);

    addLinkedGame(makeGame());
    mocks.storage.claimSeerrOperation.mockResolvedValueOnce(false);
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);

    const downloading = makeGame({ status: "downloading" });
    addLinkedGame(downloading);
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);
    downloads = [
      {
        id: "download-1",
        status: "downloading",
        downloadHash: "hash-1",
        downloaderId: "downloader-1",
        seerrExternalRequestId: "another-request",
      },
    ];
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);
    downloads[0]!.seerrExternalRequestId = REQUEST_ID;
    downloads[0]!.downloadHash = "questarr-add-pending";
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);
    downloads[0]!.downloadHash = "hash-1";
    mocks.storage.getDownloader.mockResolvedValueOnce(undefined);
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(409);
    mocks.removeDownload.mockResolvedValueOnce({ success: false });
    expect(
      (await request(app).post(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`)).status
    ).toBe(502);

    mocks.removeDownload.mockResolvedValue({ success: true });
    const cancelled = await request(app).post(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/cancel`
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(mocks.storage.updateGameDownloadStatus).toHaveBeenCalledWith(
      "download-1",
      "cancelled",
      "Cancelled through SeerrNG."
    );
    expect(mocks.storage.finishSeerrOperation).toHaveBeenCalledWith(
      "game-1",
      expect.objectContaining({ status: "shelved", seerrCancelled: true })
    );
  });

  it("lists confined assets and streams bounded byte ranges", async () => {
    const game = addLinkedGame(makeGame());
    const assetPath = path.join(libraryRoot, "game.bin");
    await fs.writeFile(assetPath, "0123456789");
    gameFiles = [
      { id: "asset-1", gameId: game.id, filePath: assetPath, originalName: "game image.bin" },
      {
        id: "outside",
        gameId: game.id,
        filePath: path.join(os.tmpdir(), "outside.bin"),
        originalName: "outside.bin",
      },
      { id: "stale", gameId: game.id, filePath: path.join(libraryRoot, "missing.bin") },
    ];

    const list = await request(app).get(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets`
    );
    expect(list.status).toBe(200);
    expect(list.body.bundleSupported).toBe(false);
    expect(list.body.assets).toHaveLength(1);
    expect(list.body.assets[0]).toMatchObject({ id: "asset-1", name: "game image.bin", size: 10 });
    expect(list.body.assets[0].url).toContain(encodeURIComponent(REQUEST_ID));

    const partial = await request(app)
      .get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets/asset-1`)
      .set("Range", "bytes=2-5");
    expect(partial.status).toBe(206);
    expect(partial.headers["content-range"]).toBe("bytes 2-5/10");
    expect(partial.body.toString()).toBe("2345");

    const suffix = await request(app)
      .get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets/asset-1`)
      .set("Range", "bytes=-3");
    expect(suffix.status).toBe(206);
    expect(suffix.body.toString()).toBe("789");
    expect(
      (
        await request(app)
          .get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets/asset-1`)
          .set("Range", "bytes=20-")
      ).status
    ).toBe(416);
    expect(
      (
        await request(app)
          .get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets/asset-1`)
          .set("Range", "bytes=1-2,4-5")
      ).status
    ).toBe(416);
    expect(
      (await request(app).get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets/missing`))
        .status
    ).toBe(404);
  });

  it("streams a request-scoped archive for multiple registered files", async () => {
    const game = addLinkedGame();
    const first = path.join(libraryRoot, "first.dat");
    const second = path.join(libraryRoot, "second.dat");
    await Promise.all([
      fs.writeFile(first, "first payload"),
      fs.writeFile(second, "second payload"),
    ]);
    gameFiles = [
      { id: "first", gameId: game.id, filePath: first, originalName: "shared.bin" },
      { id: "second", gameId: game.id, filePath: second, originalName: "shared.bin" },
    ];

    const list = await request(app).get(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets`
    );
    expect(list.body.bundleSupported).toBe(true);
    expect(list.body.bundleName).toBe("Test Game.tar.gz");
    expect(list.body.bundleUrl).toContain("/assets/bundle");

    const bundle = await request(app).get(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets/bundle`
    );
    expect(bundle.status).toBe(200);
    expect(bundle.headers["content-type"]).toContain("application/gzip");
    expect(bundle.headers["content-disposition"]).toContain("Test%20Game.tar.gz");
    const tar = gunzipSync(bundle.body).toString("utf8");
    expect(tar).toContain("shared.bin");
    expect(tar).toContain("shared (2).bin");
    expect(tar).toContain("first payload");
    expect(tar).toContain("second payload");
  });

  it("returns empty or unavailable asset results for stale roots and storage errors", async () => {
    addLinkedGame();
    mocks.storage.getImportConfig.mockResolvedValueOnce({
      libraryRoot: path.join(libraryRoot, "missing"),
    });
    const noRoot = await request(app).get(
      `/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets`
    );
    expect(noRoot.status).toBe(200);
    expect(noRoot.body.assets).toEqual([]);

    mocks.storage.getGameFiles.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(
      (await request(app).get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets`)).status
    ).toBe(500);
    games = [];
    ledger = undefined;
    expect(
      (await request(app).get(`/api/integration/seerrng/v1/requests/${REQUEST_ID}/assets`)).status
    ).toBe(404);
  });
});
