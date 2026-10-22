import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import request from "supertest";
import jwt from "jsonwebtoken";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  mockConfig,
  createStorageMock,
  createIgdbMock,
  createDbMock,
  createDbModuleMock,
  createLoggerMocks,
  createRssMock,
  createTorznabMock,
  createNewznabMock,
  createProwlarrMock,
  createXrelMock,
  createAppriseMock,
  createDownloaderManagerMock,
  createSteamRoutesMock,
  createSearchMock,
  createConfigLoaderMock,
  createSocketMock,
} from "./fixtures/common-route-mocks.js";

// Like the auth-boundary suite, this one deliberately does NOT mock ../auth.js:
// the whole point is to prove that a real API key authenticates against the
// real middleware, and that it is refused everywhere except /api/integration.
vi.mock("../storage.js", () => ({ storage: createStorageMock() }));
vi.mock("../igdb.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../igdb.js")>()),
  igdbClient: createIgdbMock(),
}));
vi.mock("../db.js", () => createDbModuleMock());
vi.mock("../cron.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cron.js")>()),
  checkAutoSearch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../logger.js", () => createLoggerMocks());
vi.mock("../rss.js", () => ({ rssService: createRssMock() }));
vi.mock("../torznab.js", () => ({ torznabClient: createTorznabMock() }));
vi.mock("../newznab.js", () => ({ newznabClient: createNewznabMock() }));
vi.mock("../prowlarr.js", () => ({ prowlarrClient: createProwlarrMock() }));
vi.mock("../xrel.js", () => createXrelMock());
vi.mock("../apprise.js", async () => createAppriseMock());
vi.mock("../downloaders.js", () => ({ DownloaderManager: createDownloaderManagerMock() }));
vi.mock("../steam-routes.js", () => ({ steamRoutes: createSteamRoutesMock() }));
vi.mock("../search.js", () => createSearchMock());
vi.mock("../config.js", () => ({ config: mockConfig }));
vi.mock("../config-loader.js", () => ({ configLoader: createConfigLoaderMock() }));
vi.mock("../socket.js", () => createSocketMock());

const JWT_SECRET = mockConfig.auth.jwtSecret;
const RAW_KEY = "qsr_test-raw-key-value";
const USER = { id: "user-1", username: "testuser" };

type Mock = ReturnType<typeof vi.fn>;

const startTestServer = (app: express.Express) =>
  new Promise<Server>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });

describe("integration API", () => {
  let app: Server;
  let storage: Awaited<typeof import("../storage.js")>["storage"];
  let keyHash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    ({ storage } = await import("../storage.js"));
    const { hashApiKey } = await import("../auth.js");
    keyHash = hashApiKey(RAW_KEY);

    (storage.countUsers as Mock).mockResolvedValue(1);
    (storage.getSystemConfig as Mock).mockResolvedValue(undefined);
    (storage.getUser as Mock).mockResolvedValue(USER);
    (storage.getUserSettings as Mock).mockResolvedValue({});
    (storage.getApiKeyByHash as Mock).mockImplementation(async (hash: string) =>
      hash === keyHash
        ? {
            id: "key-1",
            userId: USER.id,
            name: "Playnite",
            keyHash,
            prefix: "qsr_test-ra",
            scope: "integration:all",
            expiresAt: null,
          }
        : undefined
    );

    const { db } = await import("../db.js");
    (db.get as Mock).mockResolvedValue({ result: 1 });

    const { registerRoutes } = await import("../routes.js");
    const testApp = express();
    testApp.use(express.json());
    await registerRoutes(testApp);
    app = await startTestServer(testApp);
  });

  afterEach(async () => {
    if (!app.listening) return;
    await new Promise<void>((resolve, reject) => {
      app.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const withKey = (req: request.Test) => req.set("X-Api-Key", RAW_KEY);
  const tokenFor = (id: string) => jwt.sign({ id, username: "testuser" }, JWT_SECRET);

  it("advertises and streams a request-scoped multi-file bundle", async () => {
    const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "questarr-seerr-assets-"));
    try {
      const firstPath = path.join(libraryRoot, "first.bin");
      const secondPath = path.join(libraryRoot, "second.bin");
      await writeFile(firstPath, "first asset payload");
      await writeFile(secondPath, "second asset payload");

      (storage.getIntegrationRequest as Mock).mockResolvedValue({ gameId: "game-1" });
      (storage.getGame as Mock).mockResolvedValue({
        id: "game-1",
        title: "Test Game",
        userId: USER.id,
        seerrExternalRequestId: "seerrng:request:bundle",
      });
      (storage.getImportConfig as Mock).mockResolvedValue({ libraryRoot });
      (storage.getGameFiles as Mock).mockResolvedValue([
        {
          id: "file-1",
          originalName: "../first\u0000.bin",
          storedName: "first.bin",
          filePath: firstPath,
        },
        {
          id: "file-2",
          originalName: "second.bin",
          storedName: "second.bin",
          filePath: secondPath,
        },
      ]);

      expect(app.listening).toBe(true);
      expect(app.address()).not.toBeNull();
      const ping = await withKey(request(app).get("/api/integration/seerrng/v1/ping"));
      expect(ping.status).toBe(200);
      expect(ping.body.requestContractVersion).toBe(2);

      const assets = await withKey(
        request(app).get("/api/integration/seerrng/v1/requests/seerrng%3Arequest%3Abundle/assets")
      );
      expect(assets.status).toBe(200);
      expect(assets.body).toMatchObject({
        bundleSupported: true,
        bundleName: "Test Game.tar.gz",
        bundleUrl: "/api/integration/seerrng/v1/requests/seerrng%3Arequest%3Abundle/assets/bundle",
      });

      const bundle = await withKey(
        request(app).get(
          "/api/integration/seerrng/v1/requests/seerrng%3Arequest%3Abundle/assets/bundle"
        )
      )
        .buffer(true)
        .parse((stream, callback) => {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(bundle.status).toBe(200);
      expect(bundle.headers["content-type"]).toContain("application/gzip");
      expect(bundle.headers["content-disposition"]).toContain("Test%20Game.tar.gz");
      expect(bundle.headers["cache-control"]).toBe("no-store");
      const tar = gunzipSync(bundle.body as Buffer);
      expect(tar.includes(Buffer.from("first.bin"))).toBe(true);
      expect(tar.includes(Buffer.from("../first"))).toBe(false);
      expect(tar.includes(Buffer.from("second.bin"))).toBe(true);
      expect(tar.includes(Buffer.from("first asset payload"))).toBe(true);
      expect(tar.includes(Buffer.from("second asset payload"))).toBe(true);
    } finally {
      await rm(libraryRoot, { recursive: true, force: true });
    }
  });

  it("limits a SeerrNG key to the versioned provider routes", async () => {
    (storage.getApiKeyByHash as Mock).mockImplementation(async (hash: string) =>
      hash === keyHash
        ? {
            id: "key-seerr",
            userId: USER.id,
            name: "SeerrNG",
            keyHash,
            prefix: "qsr_test-ra",
            scope: "integration:seerrng",
            expiresAt: null,
          }
        : undefined
    );

    const provider = await withKey(request(app).get("/api/integration/seerrng/v1/ping"));
    expect(provider.status).toBe(200);

    const legacy = await withKey(request(app).get("/api/integration/ping"));
    expect(legacy.status).toBe(403);
  });

  it("rejects an expired integration key before loading its owner", async () => {
    (storage.getApiKeyByHash as Mock).mockImplementation(async (hash: string) =>
      hash === keyHash
        ? {
            id: "key-expired",
            userId: USER.id,
            name: "Expired SeerrNG key",
            keyHash,
            prefix: "qsr_test-ra",
            scope: "integration:seerrng",
            expiresAt: new Date(Date.now() - 1000),
          }
        : undefined
    );

    const res = await withKey(request(app).get("/api/integration/seerrng/v1/ping"));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("API key expired");
    expect(storage.getUser).not.toHaveBeenCalled();
  });

  describe("SeerrNG catalog paging", () => {
    it("binds search cursors to their original query", async () => {
      const { igdbClient } = await import("../igdb.js");
      vi.mocked(igdbClient.searchCatalogPage).mockResolvedValueOnce({
        results: [],
        cursor: { approach: 0, offset: 20, seenIds: [123] },
      });

      const first = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/search-page")
          .query({ q: "Zelda", limit: 20 })
      );
      expect(first.status).toBe(200);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const next = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/search-page")
          .query({ q: "Zelda", limit: 20, cursor: first.body.nextCursor })
      );
      expect(next.status).toBe(200);
      expect(igdbClient.searchCatalogPage).toHaveBeenLastCalledWith(
        "Zelda",
        20,
        { approach: 0, offset: 20, seenIds: [123] },
        [],
        {}
      );

      const mismatch = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/search-page")
          .query({ q: "Mario", limit: 20, cursor: first.body.nextCursor })
      );
      expect(mismatch.status).toBe(400);
      const platformMismatch = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/search-page")
          .query({ q: "Zelda", limit: 20, platformIds: "130", cursor: first.body.nextCursor })
      );
      expect(platformMismatch.status).toBe(400);
      const genreMismatch = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/search-page")
          .query({ q: "Zelda", limit: 20, genre: "Adventure", cursor: first.body.nextCursor })
      );
      expect(genreMismatch.status).toBe(400);
    });

    it("returns a bounded next offset for popular titles", async () => {
      const { igdbClient } = await import("../igdb.js");
      vi.mocked(igdbClient.getPopularGames).mockResolvedValueOnce([
        { id: 1, name: "One" },
        { id: 2, name: "Two" },
        { id: 3, name: "Three" },
      ]);
      const response = await withKey(
        request(app).get("/api/integration/seerrng/v1/catalog/popular-page").query({ limit: 2 })
      );
      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.nextOffset).toBe(2);
      expect(igdbClient.getPopularGames).toHaveBeenCalledWith(3, 0);
    });

    it("filters popular pages by platform before advancing the offset", async () => {
      const { igdbClient } = await import("../igdb.js");
      vi.mocked(igdbClient.getPopularGames)
        .mockResolvedValueOnce([
          { id: 1, name: "PC", platforms: [{ id: 6, name: "PC" }] },
          { id: 2, name: "NES", platforms: [{ id: 130, name: "NES" }] },
        ])
        .mockResolvedValueOnce([{ id: 3, name: "NES 2", platforms: [{ id: 130, name: "NES" }] }]);
      const response = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/popular-page")
          .query({ limit: 2, platformIds: "130" })
      );
      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.nextOffset).toBe(3);
      expect(igdbClient.getPopularGames).toHaveBeenNthCalledWith(1, 2, 0);
      expect(igdbClient.getPopularGames).toHaveBeenNthCalledWith(2, 1, 2);
    });

    it("filters popular pages by genre and release year before advancing", async () => {
      const { igdbClient } = await import("../igdb.js");
      vi.mocked(igdbClient.getPopularGames)
        .mockResolvedValueOnce([
          {
            id: 1,
            name: "Wrong genre",
            genres: [{ id: 1, name: "Puzzle" }],
            first_release_date: 1704067200,
          },
          {
            id: 2,
            igdbId: 2,
            name: "Match",
            title: "Match",
            genres: [{ id: 2, name: "Adventure" }],
            first_release_date: 1704067200,
          },
        ])
        .mockResolvedValueOnce([]);
      const response = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/popular-page")
          .query({ limit: 2, genre: "Adventure", releaseYear: 2024 })
      );
      expect(response.status).toBe(200);
      expect(response.body.results.map((game: { igdbId: number }) => game.igdbId)).toEqual([2]);
    });
  });

  describe("SeerrNG edition and discovery routes", () => {
    async function catalogMocks() {
      const { igdbClient } = await import("../igdb.js");
      const mocks = {
        getEditionGraph: vi.fn(),
        discoverGames: vi.fn(),
        formatGameData: vi.fn((game: Record<string, unknown>) => game),
        getTimeToBeats: vi.fn().mockResolvedValue(new Map()),
      };
      Object.assign(igdbClient, mocks);
      return mocks;
    }

    it("returns edition and add-on availability using only owned library states", async () => {
      const igdb = await catalogMocks();
      igdb.getEditionGraph.mockResolvedValueOnce({
        base: {
          id: 42,
          name: "Example Game",
          dlcs: [{ id: 51, name: "Story Chapter" }],
          expansions: [{ id: 52, name: "Large Expansion", game_type: 2 }],
        },
        editions: [
          {
            id: 43,
            name: "Example Game Deluxe",
            version_title: "Deluxe",
          },
        ],
      });
      (storage.getUserGamesByIgdbIds as Mock).mockResolvedValueOnce([
        { igdbId: 42, status: "playing" },
        { igdbId: 43, status: "completed" },
        { igdbId: 51, status: "wanted" },
      ]);

      const response = await withKey(
        request(app).get("/api/integration/seerrng/v1/catalog/games/42/editions")
      );

      expect(response.status).toBe(200);
      expect(storage.getUserGamesByIgdbIds).toHaveBeenCalledWith(USER.id, [42, 43, 51, 52]);
      expect(response.body.base).toMatchObject({ igdbId: 42, owned: true, status: "playing" });
      expect(response.body.editions[0]).toMatchObject({
        igdbId: 43,
        title: "Example Game: Deluxe",
        owned: true,
      });
      expect(response.body.addons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ igdbId: 51, title: "Story Chapter", owned: false }),
          expect.objectContaining({ igdbId: 52, title: "Large Expansion", type: "expansion" }),
        ])
      );
    });

    it("rejects invalid edition IDs, reports missing catalog games, and maps IGDB failures", async () => {
      const igdb = await catalogMocks();
      const invalid = await withKey(
        request(app).get("/api/integration/seerrng/v1/catalog/games/1.5/editions")
      );
      expect(invalid.status).toBe(400);

      igdb.getEditionGraph.mockResolvedValueOnce({ base: null, editions: [] });
      const missing = await withKey(
        request(app).get("/api/integration/seerrng/v1/catalog/games/42/editions")
      );
      expect(missing.status).toBe(404);

      igdb.getEditionGraph.mockRejectedValueOnce(new Error("IGDB unavailable"));
      const unavailable = await withKey(
        request(app).get("/api/integration/seerrng/v1/catalog/games/42/editions")
      );
      expect(unavailable.status).toBe(502);
      expect(unavailable.body.error).toBe("IGDB catalog is unavailable.");
    });

    it("validates discovery filters and requires at least one filter", async () => {
      const igdb = await catalogMocks();
      const noFilters = await withKey(
        request(app).get("/api/integration/seerrng/v1/catalog/discover")
      );
      expect(noFilters.status).toBe(400);

      const repeatedFacet = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/discover")
          .query({ q: "game", genres: ["RPG", "Adventure"] })
      );
      expect(repeatedFacet.status).toBe(400);

      const oversizedFacet = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/discover")
          .query({ q: "game", themes: "x".repeat(1501) })
      );
      expect(oversizedFacet.status).toBe(400);

      const excessiveFacetValues = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/discover")
          .query({
            q: "game",
            languages: Array.from({ length: 21 }, (_, index) => `L${index}`).join(","),
          })
      );
      expect(excessiveFacetValues.status).toBe(400);

      for (const query of [
        { minYear: 1969 },
        { minYear: 2101 },
        { minYear: 2024.5 },
        { maxHoursToBeat: 0 },
        { maxHoursToBeat: 2001 },
        { maxHoursToBeat: "not-a-number" },
      ]) {
        const invalid = await withKey(
          request(app)
            .get("/api/integration/seerrng/v1/catalog/discover")
            .query({ q: "game", ...query })
        );
        expect(invalid.status).toBe(400);
      }
      expect(igdb.discoverGames).not.toHaveBeenCalled();
    });

    it("maps filtered discovery results, language facets, playtime, and bounded cursors", async () => {
      const igdb = await catalogMocks();
      const game = {
        id: 99,
        igdbId: 99,
        name: "Example Game",
        title: "Example Game",
        themes: [{ name: "Fantasy" }],
        game_modes: [{ name: "Single player" }],
        player_perspectives: [{ name: "Third person" }],
        language_supports: [
          { language: { name: "English" }, language_support_type: { name: "Audio" } },
          { language: { name: "English" }, language_support_type: { name: "Audio" } },
          { language: { name: "French" }, language_support_type: { name: "Subtitles" } },
          { language: { name: "German" }, language_support_type: { name: "Interface" } },
          { language: null, language_support_type: { name: "Audio" } },
          { language: { name: "Japanese" }, language_support_type: null },
        ],
      };
      igdb.discoverGames.mockResolvedValueOnce([game]);
      igdb.getTimeToBeats.mockResolvedValueOnce(new Map([[99, { normally: 30 }]]));

      const response = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/discover")
          .query({
            q: "x".repeat(110),
            themes: "Fantasy, Sci-fi",
            gameModes: "Single player",
            perspectives: "Third person",
            genres: "RPG",
            languages: "English",
            excludeThemes: "Horror",
            excludeGameModes: "Multiplayer",
            excludeGenres: "Sports",
            minYear: 2024,
            maxHoursToBeat: 40,
            limit: 1,
            cursor: "3",
          })
      );

      expect(response.status).toBe(200);
      expect(igdb.discoverGames).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "x".repeat(100),
          themes: ["Fantasy", "Sci-fi"],
          gameModes: ["Single player"],
          perspectives: ["Third person"],
          genres: ["RPG"],
          languages: ["English"],
          excludeThemes: ["Horror"],
          excludeGameModes: ["Multiplayer"],
          excludeGenres: ["Sports"],
          minYear: 2024,
        }),
        1,
        3
      );
      expect(response.body.nextCursor).toBe("4");
      expect(response.body.results[0]).toMatchObject({
        igdbId: 99,
        timeToBeat: { normally: 30 },
        themes: ["Fantasy"],
        gameModes: ["Single player"],
        perspectives: ["Third person"],
        languages: {
          audio: ["English"],
          subtitles: ["French"],
          interface: ["German"],
        },
      });
    });

    it("uses default paging, tolerates missing playtime data, and maps discovery errors", async () => {
      const igdb = await catalogMocks();
      igdb.discoverGames.mockResolvedValueOnce([
        { id: 100, igdbId: 100, title: "Short", timeToBeat: null },
      ]);
      igdb.getTimeToBeats.mockRejectedValueOnce(new Error("HowLongToBeat unavailable"));
      const response = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/discover")
          .query({ genres: "RPG", cursor: "not-a-cursor" })
      );
      expect(response.status).toBe(200);
      expect(igdb.discoverGames).toHaveBeenCalledWith(
        expect.objectContaining({ genres: ["RPG"] }),
        24,
        0
      );
      expect(response.body.nextCursor).toBeNull();
      expect(response.body.results[0].timeToBeat).toBeNull();

      igdb.discoverGames.mockRejectedValueOnce(new Error("IGDB unavailable"));
      const unavailable = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/catalog/discover")
          .query({ minYear: 2024, limit: 999 })
      );
      expect(unavailable.status).toBe(502);
    });

    it("keeps an existing base game while reporting selected editions and add-ons as pending", async () => {
      const igdb = await catalogMocks();
      igdb.getEditionGraph.mockResolvedValue({
        base: {
          id: 42,
          name: "Example Game",
          dlcs: [
            { id: 51, name: "Story Chapter" },
            { id: 52, name: "Soundtrack" },
          ],
        },
        editions: [{ id: 43, name: "Example Game Deluxe", version_title: "Deluxe" }],
      });

      const game = {
        id: "owned-game",
        title: "Example Game",
        userId: USER.id,
        igdbId: 42,
        status: "owned",
      };
      let ledger: Record<string, unknown> | undefined;
      const addIntegrationRequest = vi.fn(async (input: Record<string, unknown>) => {
        ledger = { ...input, status: "accepted", gameId: null, errorMessage: null };
        return ledger;
      });
      const updateIntegrationRequest = vi.fn(
        async (_userId: string, _externalRequestId: string, update: Record<string, unknown>) => {
          ledger = { ...ledger, ...update };
          return ledger;
        }
      );
      Object.assign(storage, { addIntegrationRequest, updateIntegrationRequest });
      (storage.getIntegrationRequest as Mock).mockImplementation(async () => ledger);
      (storage.getUserGamesByIgdbIds as Mock).mockResolvedValue([game]);
      (storage.getGame as Mock).mockResolvedValue(game);

      const makeRequest = (externalRequestId: string, selection: Record<string, unknown>) =>
        withKey(request(app).post("/api/integration/seerrng/v1/requests")).send({
          externalRequestId,
          title: "Example Game",
          igdbId: 42,
          variant: { operatingSystem: "windows", architecture: "x64" },
          selection: { kind: "game-content", ...selection },
        });

      const edition = await makeRequest("seerrng:edition", { mode: "edition", editionId: 43 });
      expect(edition.status).toBe(201);
      expect(edition.body.status).toBe("searching");
      expect(edition.body.content).toEqual({
        mode: "edition",
        pending: [{ id: 43, title: "Example Game Deluxe" }],
        acquiredCount: 0,
      });

      ledger = undefined;
      const addons = await makeRequest("seerrng:addons", {
        mode: "missing-selected",
        addonIds: [51, 52],
      });
      expect(addons.status).toBe(201);
      expect(addons.body.content).toEqual({
        mode: "missing-selected",
        pending: [
          { id: 51, title: "Story Chapter" },
          { id: 52, title: "Soundtrack" },
        ],
        acquiredCount: 0,
      });
      expect(addIntegrationRequest).toHaveBeenCalledTimes(2);
      expect(updateIntegrationRequest).toHaveBeenCalled();
    });

    it("rejects content selections that are unlinked, incomplete, or different from a retry", async () => {
      const igdb = await catalogMocks();
      const postSelection = (body: Record<string, unknown>) =>
        withKey(request(app).post("/api/integration/seerrng/v1/requests")).send({
          externalRequestId: "seerrng:invalid-selection",
          title: "Example Game",
          variant: { operatingSystem: "windows", architecture: "x64" },
          ...body,
        });

      const selection = { kind: "game-content", mode: "edition", editionId: 43 };
      expect((await postSelection({ selection })).status).toBe(400);
      expect(igdb.getEditionGraph).not.toHaveBeenCalled();

      igdb.getEditionGraph.mockResolvedValueOnce({ base: null, editions: [] });
      expect((await postSelection({ igdbId: 42, selection })).status).toBe(400);

      const base = {
        id: 42,
        name: "Example Game",
        dlcs: [{ id: 51, name: "Story Chapter" }],
      };
      igdb.getEditionGraph.mockResolvedValueOnce({ base, editions: [] });
      expect((await postSelection({ igdbId: 42, selection })).status).toBe(400);

      igdb.getEditionGraph.mockResolvedValueOnce({ base, editions: [] });
      expect(
        (
          await postSelection({
            igdbId: 42,
            selection: { kind: "game-content", mode: "missing-selected", addonIds: [999] },
          })
        ).status
      ).toBe(400);

      igdb.getEditionGraph.mockResolvedValueOnce({ base, editions: [] });
      expect(
        (
          await postSelection({
            igdbId: 42,
            selection: { kind: "game-content", mode: "missing-selected", addonIds: [] },
          })
        ).status
      ).toBe(400);

      igdb.getEditionGraph.mockRejectedValueOnce(new Error("IGDB unavailable"));
      expect((await postSelection({ igdbId: 42, selection })).status).toBe(502);

      let ledger: Record<string, unknown> | undefined = {
        externalRequestId: "seerrng:invalid-selection",
        title: "Example Game",
        igdbId: 42,
        operatingSystem: "windows",
        architecture: "x64",
        selection: null,
      };
      (storage.getIntegrationRequest as Mock).mockImplementation(async () => ledger);
      igdb.getEditionGraph.mockResolvedValueOnce({ base, editions: [{ id: 43, name: "Deluxe" }] });
      const differentRetry = await postSelection({ igdbId: 42, selection });
      expect(differentRetry.status).toBe(409);
      expect(differentRetry.body.error).toContain("different request identity");
    });
  });

  describe("SeerrNG library lookup", () => {
    it("returns only visible statuses for the requested IGDB IDs", async () => {
      (storage.getUserGamesByIgdbIds as Mock).mockResolvedValue([
        { igdbId: 42, status: "owned", isAdultContent: false },
        { igdbId: 43, status: "wanted", isAdultContent: true },
      ]);
      const response = await withKey(
        request(app).get("/api/integration/seerrng/v1/library/lookup").query({ igdbIds: "42,43" })
      );
      expect(response.status).toBe(200);
      expect(response.body.games).toEqual([{ igdbId: 42, status: "owned", deliverable: false }]);
      expect(storage.getUserGamesByIgdbIds).toHaveBeenCalledWith(USER.id, [42, 43]);
    });

    it("rejects an unbounded or malformed ID list", async () => {
      const response = await withKey(
        request(app)
          .get("/api/integration/seerrng/v1/library/lookup")
          .query({ igdbIds: "42,not-an-id" })
      );
      expect(response.status).toBe(400);
      expect(storage.getUserGamesByIgdbIds).not.toHaveBeenCalled();
    });
  });

  it("returns bounded detail media without changing catalog pages", async () => {
    const { igdbClient } = await import("../igdb.js");
    vi.mocked(igdbClient.getGameById).mockResolvedValueOnce({
      id: 42,
      name: "Test Game",
      title: "Test Game",
      igdbId: 42,
      screenshots: ["https://images.igdb.com/test.jpg"],
      videos: [
        null,
        { video_id: "abcdefghijk", name: "Trailer" },
        { video_id: "bad-id", name: "Invalid" },
      ],
    } as never);
    const response = await withKey(
      request(app).get("/api/integration/seerrng/v1/catalog/games/42")
    );
    expect(response.status).toBe(200);
    expect(igdbClient.getGameById).toHaveBeenCalledWith(42, true);
    expect(response.body.screenshots).toEqual(["https://images.igdb.com/test.jpg"]);
    expect(response.body.videos).toEqual([{ name: "Trailer", videoId: "abcdefghijk" }]);
  });

  describe("authentication", () => {
    it("rejects an unauthenticated integration request", async () => {
      const res = await request(app).get("/api/integration/ping");
      expect(res.status).toBe(401);
    });

    it("accepts a valid API key via X-Api-Key", async () => {
      const res = await withKey(request(app).get("/api/integration/ping"));
      expect(res.status).toBe(200);
      expect(res.body.service).toBe("questarr");
      expect(res.body.authenticatedAs.username).toBe("testuser");
      expect(res.body.usingApiKey).toBe(true);
    });

    it("accepts the same key as an Authorization: Bearer credential", async () => {
      const res = await request(app)
        .get("/api/integration/ping")
        .set("Authorization", `Bearer ${RAW_KEY}`);
      expect(res.status).toBe(200);
      expect(res.body.usingApiKey).toBe(true);
    });

    it("rejects an unknown API key", async () => {
      const res = await request(app)
        .get("/api/integration/ping")
        .set("X-Api-Key", "qsr_not-a-real-key");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid API key");
    });

    it("still accepts a JWT, so the browser UI keeps working", async () => {
      const res = await request(app)
        .get("/api/integration/ping")
        .set("Authorization", `Bearer ${tokenFor(USER.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.usingApiKey).toBe(false);
    });

    it("records the key's last-used timestamp", async () => {
      await withKey(request(app).get("/api/integration/ping"));
      expect(storage.touchApiKey).toHaveBeenCalledWith("key-1");
    });

    it("does not fail the request when recording last-used time fails", async () => {
      (storage.touchApiKey as Mock).mockRejectedValue(new Error("db unavailable"));
      const res = await withKey(request(app).get("/api/integration/ping"));
      expect(res.status).toBe(200);
    });

    it("rejects a key whose owning user no longer exists", async () => {
      (storage.getUser as Mock).mockImplementation(async (id: string) =>
        id === USER.id ? undefined : USER
      );

      const res = await withKey(request(app).get("/api/integration/ping"));

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid API key");
    });

    it("returns 500 when API key authentication itself fails", async () => {
      (storage.getApiKeyByHash as Mock).mockRejectedValue(new Error("db unavailable"));

      const res = await withKey(request(app).get("/api/integration/ping"));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Authentication failed");
    });

    it("does NOT accept an API key outside the integration surface", async () => {
      // The key must be useless against the rest of the API — most importantly
      // against key management itself, so a leaked key cannot mint another.
      const res = await request(app).get("/api/config").set("X-Api-Key", RAW_KEY);
      expect(res.status).toBe(401);
    });

    it("does NOT let an API key list or create other keys", async () => {
      const list = await request(app).get("/api/api-keys").set("X-Api-Key", RAW_KEY);
      expect(list.status).toBe(401);

      const create = await request(app)
        .post("/api/api-keys")
        .set("X-Api-Key", RAW_KEY)
        .send({ name: "escalation" });
      expect(create.status).toBe(401);
    });
  });

  describe("GET /api/integration/library", () => {
    it("returns the caller's library in the external shape", async () => {
      (storage.getUserGames as Mock).mockResolvedValue([
        {
          id: "game-1",
          title: "Hollow Knight",
          igdbId: 14593,
          steamAppId: 367520,
          status: "owned",
          coverUrl: "https://example.test/cover.jpg",
          platforms: ["PC"],
          genres: ["Platform"],
          libraryPath: null,
          addedAt: null,
          releaseStatus: "released",
          releaseDate: "2017-02-24",
          // Fields that must not leak into the integration payload:
          userId: "user-1",
          notes: "private note",
        },
      ]);

      const res = await withKey(request(app).get("/api/integration/library"));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.games[0]).toMatchObject({ id: "game-1", title: "Hollow Knight" });
      expect(res.body.games[0]).not.toHaveProperty("notes");
      expect(res.body.games[0]).not.toHaveProperty("userId");
    });

    it("passes a comma-separated status filter through to storage", async () => {
      await withKey(request(app).get("/api/integration/library?status=wanted,owned"));
      expect(storage.getUserGames).toHaveBeenCalledWith("user-1", false, ["wanted", "owned"]);
    });

    it("rejects a malformed status filter instead of silently matching everything", async () => {
      const res = await withKey(request(app).get("/api/integration/library?status=,"));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid query parameters");
    });

    it("rejects an unknown status value", async () => {
      const res = await withKey(
        request(app).get("/api/integration/library?status=not-a-real-status")
      );
      expect(res.status).toBe(400);
    });

    it("hides content the user filtered out, matching /api/games", async () => {
      (storage.getUserGames as Mock).mockResolvedValue([
        { id: "game-1", title: "Visible Game", status: "owned", isAdultContent: false },
        { id: "game-2", title: "Filtered Game", status: "owned", isAdultContent: true },
      ]);
      (storage.getUserSettings as Mock).mockResolvedValue({ hideAdultContent: true });

      const res = await withKey(request(app).get("/api/integration/library"));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.games.map((g: { id: string }) => g.id)).toEqual(["game-1"]);
    });

    it("applies erotic and age-rating preferences independently", async () => {
      (storage.getUserGames as Mock).mockResolvedValue([
        {
          id: "standard",
          title: "Standard Game",
          status: "owned",
          isAdultContent: false,
          isAgeRestricted: false,
        },
        {
          id: "erotic-only",
          title: "Erotic Theme Only",
          status: "owned",
          isAdultContent: true,
          isAgeRestricted: false,
        },
        {
          id: "age-restricted-only",
          title: "Age Restricted Only",
          status: "owned",
          isAdultContent: false,
          isAgeRestricted: true,
        },
        {
          id: "both",
          title: "Both Signals",
          status: "owned",
          isAdultContent: true,
          isAgeRestricted: true,
        },
      ]);
      (storage.getUserSettings as Mock).mockResolvedValue({
        hideAdultContent: false,
        hideAgeRestrictedContent: true,
      });

      const res = await withKey(request(app).get("/api/integration/library"));

      expect(res.status).toBe(200);
      expect(res.body.games.map((g: { id: string }) => g.id)).toEqual(["standard", "erotic-only"]);
    });

    it("returns 500 when the library lookup fails", async () => {
      (storage.getUserGames as Mock).mockRejectedValue(new Error("db unavailable"));

      const res = await withKey(request(app).get("/api/integration/library"));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch library");
    });
  });

  describe("POST /api/integration/library/sync", () => {
    const library = [
      {
        id: "game-1",
        title: "The Witcher 3: Wild Hunt",
        status: "wanted",
        steamAppId: 292030,
      },
      { id: "game-2", title: "Celeste", status: "owned", steamAppId: null },
    ];

    beforeEach(() => {
      (storage.getUserGames as Mock).mockResolvedValue(library);
      (storage.updateGameStatus as Mock).mockResolvedValue(undefined);
    });

    it("matches on a normalized title", async () => {
      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "the witcher 3 wild hunt", externalId: "pn-1" }],
      });

      expect(res.status).toBe(200);
      expect(res.body.matched).toHaveLength(1);
      expect(res.body.matched[0]).toMatchObject({ gameId: "game-1", externalId: "pn-1" });
      expect(res.body.unmatched).toHaveLength(0);
    });

    it("prefers a Steam app id over the title", async () => {
      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "Something Playnite Named Differently", steamAppId: 292030 }],
      });

      expect(res.body.matched[0].gameId).toBe("game-1");
    });

    it("reports titles Questarr does not know", async () => {
      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "A Game Not In Questarr", externalId: "pn-9" }],
      });

      expect(res.body.matched).toHaveLength(0);
      expect(res.body.unmatched).toEqual([{ externalId: "pn-9", title: "A Game Not In Questarr" }]);
    });

    it("leaves statuses alone unless markInstalledAsOwned is set", async () => {
      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "The Witcher 3: Wild Hunt", installed: true }],
      });

      expect(storage.updateGameStatus).not.toHaveBeenCalled();
      expect(res.body.promotedToOwned).toBe(0);
    });

    it("promotes an installed 'wanted' game to 'owned' when asked", async () => {
      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "The Witcher 3: Wild Hunt", installed: true }],
        markInstalledAsOwned: true,
      });

      expect(storage.updateGameStatus).toHaveBeenCalledWith("game-1", { status: "owned" });
      expect(res.body.promotedToOwned).toBe(1);
      expect(res.body.matched[0].status).toBe("owned");
    });

    it("does not touch a game that is already owned", async () => {
      await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "Celeste", installed: true }],
        markInstalledAsOwned: true,
      });

      expect(storage.updateGameStatus).not.toHaveBeenCalled();
    });

    it("rejects an empty payload", async () => {
      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [],
      });
      expect(res.status).toBe(400);
    });

    it("matches against the first game when two library entries share a normalized title", async () => {
      (storage.getUserGames as Mock).mockResolvedValue([
        ...library,
        { id: "game-3", title: "celeste", status: "owned", steamAppId: null },
      ]);

      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "Celeste" }],
      });

      expect(res.body.matched[0].gameId).toBe("game-2");
    });

    it("returns 500 when the sync fails", async () => {
      (storage.getUserGames as Mock).mockRejectedValue(new Error("db unavailable"));

      const res = await withKey(request(app).post("/api/integration/library/sync")).send({
        games: [{ title: "Anything" }],
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Library sync failed");
    });
  });

  describe("POST /api/integration/games/request", () => {
    beforeEach(async () => {
      const { igdbClient } = await import("../igdb.js");
      (igdbClient.searchGames as Mock).mockResolvedValue([{ id: 1 }]);
      (igdbClient.formatGameData as Mock).mockReturnValue({
        title: "Hades",
        igdbId: 113112,
        platforms: ["PC"],
        releaseDate: "2020-09-17",
        isAdultContent: false,
        isAgeRestricted: false,
      });
      (storage.getUserGames as Mock).mockResolvedValue([]);
      (storage.addGame as Mock).mockImplementation(async (game: Record<string, unknown>) => ({
        ...game,
        id: "new-game",
      }));
    });

    it("adds a matched game as 'wanted' so auto-search picks it up", async () => {
      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Hades",
      });

      expect(res.status).toBe(201);
      expect(res.body.game).toMatchObject({ id: "new-game", title: "Hades" });
      expect(storage.addGame).toHaveBeenCalledWith(
        expect.objectContaining({ status: "wanted", userId: "user-1", source: "api" })
      );
    });

    it("stamps an already-released game so it is not filed as upcoming", async () => {
      await withKey(request(app).post("/api/integration/games/request")).send({ title: "Hades" });

      expect(storage.addGame).toHaveBeenCalledWith(
        expect.objectContaining({ releaseStatus: "released" })
      );
    });

    it("returns 409 when the game is already in the library", async () => {
      (storage.getUserGames as Mock).mockResolvedValue([
        {
          id: "game-1",
          title: "Hades",
          igdbId: 113112,
          status: "owned",
          userId: "user-1",
          notes: "private note",
        },
      ]);

      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Hades",
      });

      expect(res.status).toBe(409);
      expect(res.body.game.id).toBe("game-1");
      expect(res.body.game).not.toHaveProperty("notes");
      expect(res.body.game).not.toHaveProperty("userId");
      expect(storage.addGame).not.toHaveBeenCalled();
    });

    it("returns 404 when IGDB has no match", async () => {
      const { igdbClient } = await import("../igdb.js");
      (igdbClient.searchGames as Mock).mockResolvedValue([]);

      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Definitely Not A Game",
      });

      expect(res.status).toBe(404);
    });

    it("hides a content-filtered match behind the same 404", async () => {
      const { igdbClient } = await import("../igdb.js");
      (igdbClient.formatGameData as Mock).mockReturnValue({
        title: "Filtered",
        igdbId: 999,
        isAdultContent: true,
      });
      (storage.getUserSettings as Mock).mockResolvedValue({ hideAdultContent: true });

      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Filtered",
      });

      expect(res.status).toBe(404);
      expect(storage.addGame).not.toHaveBeenCalled();
    });

    it("hides an age-restricted quick-add match when only that filter is enabled", async () => {
      const { igdbClient } = await import("../igdb.js");
      (igdbClient.formatGameData as Mock).mockReturnValue({
        title: "Age Restricted",
        igdbId: 1000,
        isAdultContent: false,
        isAgeRestricted: true,
      });
      (storage.getUserSettings as Mock).mockResolvedValue({
        hideAdultContent: false,
        hideAgeRestrictedContent: true,
      });

      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Age Restricted",
      });

      expect(res.status).toBe(404);
      expect(storage.addGame).not.toHaveBeenCalled();
    });

    it("rejects a blank title", async () => {
      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "   ",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when the matched IGDB data fails schema validation", async () => {
      const { igdbClient } = await import("../igdb.js");
      // No title -- insertGameSchema requires one, so quickAddGameByTitle's
      // own `insertGameSchema.parse` throws a ZodError before storage is touched.
      (igdbClient.formatGameData as Mock).mockReturnValue({
        igdbId: 113112,
        isAdultContent: false,
        isAgeRestricted: false,
      });

      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Hades",
      });

      expect(res.status).toBe(400);
      expect(storage.addGame).not.toHaveBeenCalled();
    });

    it("returns 500 when the request fails for a reason other than validation", async () => {
      (storage.getUserGames as Mock).mockRejectedValue(new Error("db unavailable"));

      const res = await withKey(request(app).post("/api/integration/games/request")).send({
        title: "Hades",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to request game");
    });
  });

  describe("API key management (JWT only)", () => {
    const authed = (req: request.Test) => req.set("Authorization", `Bearer ${tokenFor(USER.id)}`);

    it("returns the raw key exactly once, on creation", async () => {
      (storage.getApiKeys as Mock).mockResolvedValue([]);
      (storage.addApiKey as Mock).mockImplementation(
        async (key: { name: string; prefix: string; scope: string; expiresAt: Date }) => ({
          id: "key-2",
          userId: USER.id,
          name: key.name,
          prefix: key.prefix,
          scope: key.scope,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          expiresAt: key.expiresAt,
        })
      );

      const res = await authed(request(app).post("/api/api-keys")).send({
        name: "SeerrNG",
        scope: "integration:seerrng",
        expiresInDays: 90,
      });

      expect(res.status).toBe(201);
      expect(res.body.key).toMatch(/^qsr_/);
      expect(res.body).not.toHaveProperty("keyHash");

      // What got persisted must be the hash, never the key itself.
      const stored = (storage.addApiKey as Mock).mock.calls[0][0];
      expect(stored.keyHash).not.toContain(res.body.key);
      const { hashApiKey } = await import("../auth.js");
      expect(stored.keyHash).toBe(hashApiKey(res.body.key));
      expect(stored.scope).toBe("integration:seerrng");
      expect(stored.expiresAt).toBeInstanceOf(Date);
    });

    it("never lets a shared cache store key data or a freshly-minted raw key", async () => {
      (storage.getApiKeys as Mock).mockResolvedValue([]);
      (storage.addApiKey as Mock).mockImplementation(
        async (key: {
          userId: string;
          name: string;
          keyHash: string;
          prefix: string;
          scope: string;
          expiresAt: Date;
        }) => ({
          id: "key-1",
          userId: key.userId,
          name: key.name,
          prefix: key.prefix,
          scope: key.scope,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          expiresAt: key.expiresAt,
        })
      );

      const list = await authed(request(app).get("/api/api-keys"));
      expect(list.headers["cache-control"]).toBe("no-store");

      const created = await authed(request(app).post("/api/api-keys")).send({ name: "Playnite" });
      expect(created.headers["cache-control"]).toBe("no-store");
    });

    it("returns 500 when listing keys fails", async () => {
      (storage.getApiKeys as Mock).mockRejectedValue(new Error("db unavailable"));
      const res = await authed(request(app).get("/api/api-keys"));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to list API keys");
    });

    it("never exposes the hash when listing keys", async () => {
      (storage.getApiKeys as Mock).mockResolvedValue([
        {
          id: "key-1",
          userId: USER.id,
          name: "Playnite",
          prefix: "qsr_abc",
          scope: "integration:all",
          createdAt: null,
          lastUsedAt: null,
          expiresAt: null,
        },
      ]);

      const res = await authed(request(app).get("/api/api-keys"));

      expect(res.status).toBe(200);
      expect(res.body[0]).not.toHaveProperty("keyHash");
    });

    it("rejects a blank name", async () => {
      const res = await authed(request(app).post("/api/api-keys")).send({ name: "  " });
      expect(res.status).toBe(400);
    });

    it("returns 409 when storage reports the per-user key cap is reached", async () => {
      // storage.addApiKey does the count-and-insert atomically and throws
      // this exact message when the cap is hit; the route translates it to
      // a 409 rather than a generic 500.
      (storage.addApiKey as Mock).mockRejectedValue(new Error("API key limit reached"));

      const res = await authed(request(app).post("/api/api-keys")).send({ name: "One too many" });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/at most/i);
    });

    it("returns 500 when key creation fails for a reason other than the cap", async () => {
      (storage.addApiKey as Mock).mockRejectedValue(new Error("db unavailable"));

      const res = await authed(request(app).post("/api/api-keys")).send({ name: "Playnite" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create API key");
    });

    it("revokes a key scoped to the calling user", async () => {
      const keyId = "11111111-1111-4111-8111-111111111111";
      (storage.removeApiKey as Mock).mockResolvedValue(true);
      const res = await authed(request(app).delete(`/api/api-keys/${keyId}`));

      expect(res.status).toBe(204);
      expect(storage.removeApiKey).toHaveBeenCalledWith(keyId, USER.id);
    });

    it("returns 404 when the key belongs to someone else", async () => {
      const keyId = "22222222-2222-4222-8222-222222222222";
      (storage.removeApiKey as Mock).mockResolvedValue(false);
      const res = await authed(request(app).delete(`/api/api-keys/${keyId}`));
      expect(res.status).toBe(404);
    });

    it("rejects a malformed key ID before it ever reaches storage", async () => {
      const res = await authed(request(app).delete("/api/api-keys/not-a-uuid"));
      expect(res.status).toBe(400);
      expect(storage.removeApiKey).not.toHaveBeenCalled();
    });

    it("returns 500 when revocation fails", async () => {
      const keyId = "33333333-3333-4333-8333-333333333333";
      (storage.removeApiKey as Mock).mockRejectedValue(new Error("db unavailable"));

      const res = await authed(request(app).delete(`/api/api-keys/${keyId}`));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to revoke API key");
    });
  });
});

describe("integrationRouter's own auth guard", () => {
  // Every real mount point runs this router behind authenticateApiKeyOrToken,
  // so req.user is always populated by the time a request reaches it. This
  // guard only exists as defence-in-depth against a future mount that forgets
  // that middleware -- exercise it directly, without going through the app's
  // real auth stack, to prove it actually blocks an unauthenticated request.
  it("returns 401 when mounted without an authentication middleware in front of it", async () => {
    const { integrationRouter } = await import("../routes/integration.js");
    const testApp = express();
    testApp.use(express.json());
    testApp.use("/api/integration", integrationRouter);
    const server = await startTestServer(testApp);

    const res = await request(server).get("/api/integration/ping");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
