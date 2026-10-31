import { serviceMessage, parseServiceMessageDescriptor } from "../../shared/service-messages.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Indexer } from "@shared/schema";
import type { SearchItem } from "../search.js";

vi.mock("../json-catalog.js", () => ({ jsonCatalogClient: { search: vi.fn() } }));

// Mock dependencies
vi.mock("../db.js", () => ({
  dialect: "sqlite",
  pool: {},
  db: {},
}));

vi.mock("../storage.js", () => ({
  storage: {
    getEnabledIndexers: vi.fn(),
  },
}));

vi.mock("../torznab.js", () => ({
  torznabClient: {
    searchMultipleIndexers: vi.fn(),
  },
}));

vi.mock("../newznab.js", () => ({
  newznabClient: {
    searchMultipleIndexers: vi.fn(),
  },
}));

vi.mock("../typesafe.js", () => ({
  typesafeClient: {
    isConfigured: vi.fn().mockResolvedValue(false),
    analyzeRelease: vi.fn(),
  },
}));

const {
  searchAllIndexers,
  filterBlacklistedReleases,
  filterByReleaseNameBlacklist,
  enrichWithAiAnalysis,
  scoreSearchItems,
} = await import("../search.js");
const { jsonCatalogClient } = await import("../json-catalog.js");
const { storage } = await import("../storage.js");
const { torznabClient } = await import("../torznab.js");
const { newznabClient } = await import("../newznab.js");
const { typesafeClient } = await import("../typesafe.js");
const { DEFAULT_RELEASE_PROFILE } = await import("../../shared/release-scoring.js");

const makeTorznabIndexer = (overrides: Partial<Indexer> = {}): Indexer => ({
  id: "torznab-1",
  name: "Torznab Indexer",
  url: "http://torznab.example.com",
  apiKey: "key1",
  protocol: "torznab",
  enabled: true,
  priority: 1,
  categories: ["4000"],
  rssEnabled: true,
  autoSearchEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeNewznabIndexer = (overrides: Partial<Indexer> = {}): Indexer => ({
  id: "newznab-1",
  name: "Newznab Indexer",
  url: "http://newznab.example.com",
  apiKey: "key2",
  protocol: "newznab",
  enabled: true,
  priority: 1,
  categories: ["4000"],
  rssEnabled: true,
  autoSearchEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTorznabResponse = (items: object[], errors: string[] = []) => ({
  results: { items, total: items.length },
  errors,
});

const makeNewznabResponse = (items: object[], errors: string[] = []) => ({
  results: { items, total: items.length },
  errors,
});

describe("Search Module - searchAllIndexers", () => {
  it("keeps error metadata aligned across Torznab, Newznab and catalog aggregation", async () => {
    const typed = serviceMessage("service.torznab_response_invalid", {});
    const indexer = "Name العربية: {error}";
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([
      makeTorznabIndexer(),
      makeNewznabIndexer(),
      makeTorznabIndexer({ id: "catalog", protocol: "json-catalog", name: indexer }),
    ]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue({
      results: { items: [], total: 0, offset: 0 },
      errors: [typed.message, typed.message],
      errorI18n: [typed, null],
    });
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue({
      results: { items: [], total: 0, offset: 0 },
      errors: [{ indexer, error: typed.message, errorI18n: null }],
    } as never);
    vi.mocked(jsonCatalogClient.search).mockRejectedValue(
      new Error("https://private.example?token=secret")
    );
    const result = await searchAllIndexers({ query: "Game" });
    expect(result.errors).toEqual([
      typed.message,
      typed.message,
      `${indexer}: ${typed.message}`,
      `${indexer}: JSON catalog search failed; use Test Connection for details`,
    ]);
    expect(result.errorI18n).toHaveLength(4);
    expect(parseServiceMessageDescriptor(result.errorI18n?.[0])?.messageKey).toBe(typed.messageKey);
    expect(result.errorI18n?.[1]).toBeNull();
    const named = parseServiceMessageDescriptor(result.errorI18n?.[2]);
    expect(named?.messageValues).toEqual({ client: indexer, error: typed.message });
    expect(named?.messageDetails).toBeUndefined();
    expect(parseServiceMessageDescriptor(result.errorI18n?.[3])?.messageKey).toBe(
      "service.json_catalog_search_failed"
    );
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("routes catalogs through the aggregated search without sending them to Torznab", async () => {
    const indexer = makeTorznabIndexer({ protocol: "json-catalog" });
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([indexer]);
    const item = {
      title: "Game",
      link: "magnet:?xt=urn:btih:" + "a".repeat(40),
      pubDate: "2026-01-01",
      guid: "catalog-game",
      category: [],
      indexerId: indexer.id,
      indexerName: indexer.name,
      downloadType: "torrent" as const,
    };
    vi.mocked(jsonCatalogClient.search).mockResolvedValue({ items: [item], total: 1, offset: 0 });
    expect(await searchAllIndexers({ query: "Game" })).toMatchObject({
      items: [item],
      total: 1,
      errors: [],
    });
    expect(torznabClient.searchMultipleIndexers).not.toHaveBeenCalled();
    expect(newznabClient.searchMultipleIndexers).not.toHaveBeenCalled();
  });

  it("isolates a catalog failure without disclosing its URL", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([
      makeTorznabIndexer({ protocol: "json-catalog" }),
    ]);
    vi.mocked(jsonCatalogClient.search).mockRejectedValue(
      new Error("https://private.example?token=secret")
    );
    const result = await searchAllIndexers({ query: "Game" });
    expect(result.items).toEqual([]);
    expect(result.errors[0]).toContain("JSON catalog search failed");
    expect(result.errors[0]).not.toContain("secret");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty results when no indexers are configured", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([]);

    const result = await searchAllIndexers({ query: "test game" });

    expect(result).toEqual({
      items: [],
      total: 0,
      offset: 0,
      errors: ["No indexers configured"],
      errorI18n: [{ messageKey: "service.no_indexers_configured", messageValues: {} }],
    });
  });

  it("should search torznab indexers and return formatted results", async () => {
    const torznabIndexer = makeTorznabIndexer();

    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Test Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          leechers: 2,
          category: "4000",
          guid: "guid-123",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          indexerUrl: "http://torznab.example.com",
          comments: "http://torznab.example.com/details/guid-123",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: "Test Game",
      downloadType: "torrent",
      seeders: 10,
      leechers: 2,
    });
    expect(result.total).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("should search newznab indexers and return formatted results", async () => {
    const newznabIndexer = makeNewznabIndexer();

    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([newznabIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Test Usenet Game",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 5,
          age: 2.5,
          category: ["4000"],
          guid: "guid-456",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
          poster: "user@example.com",
          group: "alt.binaries.games",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: "Test Usenet Game",
      downloadType: "usenet",
      grabs: 5,
      age: 2.5,
      poster: "user@example.com",
      group: "alt.binaries.games",
    });
    expect(result.total).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("should combine results from both torznab and newznab indexers", async () => {
    const torznabIndexer = makeTorznabIndexer();
    const newznabIndexer = makeNewznabIndexer({ priority: 2 });

    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer, newznabIndexer]);

    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Torrent Game",
          link: "http://torrent.example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          category: "4000",
          guid: "guid-torrent",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
        },
      ])
    );

    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Usenet Game",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 5,
          category: ["4000"],
          guid: "guid-usenet",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].downloadType).toBe("usenet"); // Newer date, sorted first
    expect(result.items[1].downloadType).toBe("torrent");
    expect(result.total).toBe(2);
  });

  it("should sort results by date (newest first)", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Old Game",
          link: "http://example.com/old",
          pubDate: "2024-01-01T00:00:00Z",
          guid: "guid-old",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          category: "4000",
        },
        {
          title: "New Game",
          link: "http://example.com/new",
          pubDate: "2024-01-10T00:00:00Z",
          guid: "guid-new",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          category: "4000",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "game" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("New Game");
    expect(result.items[1].title).toBe("Old Game");
  });

  it("should aggregate errors from indexers", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([], ["Connection timeout", "Rate limit exceeded"])
    );

    const result = await searchAllIndexers({ query: "test" });

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain("Connection timeout");
    expect(result.errors).toContain("Rate limit exceeded");
  });

  it("should construct comments URL when not provided by indexer", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Test Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          guid: "http://example.com/details/12345",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          indexerUrl: "http://torznab.example.com",
          category: "4000",
          // No comments field provided
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].comments).toBe("http://torznab.example.com/details/12345");
  });

  it("should handle limit and offset parameters", async () => {
    const torznabIndexer = makeTorznabIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(makeTorznabResponse([]));

    await searchAllIndexers({ query: "test", limit: 25, offset: 10 });

    expect(torznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [torznabIndexer],
      expect.objectContaining({
        limit: 25,
        offset: 10,
      })
    );
  });

  it("should use default limit of 50 when not specified", async () => {
    const torznabIndexer = makeTorznabIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(makeTorznabResponse([]));

    await searchAllIndexers({ query: "test" });

    expect(torznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [torznabIndexer],
      expect.objectContaining({
        limit: 50,
        offset: 0,
      })
    );
  });
  it("should extract release group from title for torznab items", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Game.Title-RELGROUP",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          category: "4000",
          guid: "guid-123",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].group).toBe("RELGROUP");
  });

  it("should map downloadVolumeFactor and uploadVolumeFactor from torznab items", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Freeleech Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          leechers: 3,
          downloadVolumeFactor: 0,
          uploadVolumeFactor: 2,
          category: "4000",
          guid: "guid-free",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "freeleech game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].downloadVolumeFactor).toBe(0);
    expect(result.items[0].uploadVolumeFactor).toBe(2);
  });

  it("should pass through undefined downloadVolumeFactor when not provided by indexer", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Normal Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 5,
          category: "4000",
          guid: "guid-normal",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          // No downloadVolumeFactor / uploadVolumeFactor
        },
      ])
    );

    const result = await searchAllIndexers({ query: "normal game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].downloadVolumeFactor).toBeUndefined();
    expect(result.items[0].uploadVolumeFactor).toBeUndefined();
  });

  it("should map files from newznab items", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Usenet Game Complete",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 10,
          age: 1,
          files: 12,
          category: ["4000"],
          guid: "guid-nzb",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "usenet game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].files).toBe(12);
  });

  it("should pass through undefined files when not provided by newznab indexer", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Usenet Game No Files",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 5,
          category: ["4000"],
          guid: "guid-nzb-nofiles",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
          // No files field
        },
      ])
    );

    const result = await searchAllIndexers({ query: "usenet game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].files).toBeUndefined();
  });
});

describe("Search Module - release scoring", () => {
  const candidate = (title: string) => ({
    title,
    link: `https://example.com/${encodeURIComponent(title)}`,
    pubDate: "2026-01-01T00:00:00.000Z",
    indexerId: "indexer-1",
    indexerName: "Test Indexer",
    category: ["4050"],
    guid: title,
    downloadType: "torrent" as const,
  });

  it("attaches evaluations, sorts accepted results first, and can exclude rejects for auto-search", () => {
    const items = [candidate("Dishonored.2-CODEX"), candidate("Dishonored-CODEX")];
    const context = { gameTitle: "Dishonored" };
    const scored = scoreSearchItems(items, context, DEFAULT_RELEASE_PROFILE);

    expect(scored.map((item) => [item.title, item.releaseEvaluation?.accepted])).toEqual([
      ["Dishonored-CODEX", true],
      ["Dishonored.2-CODEX", false],
    ]);
    expect(scored[0]?.releaseEvaluation?.score).toBeGreaterThan(0);
    expect(
      scoreSearchItems(items, context, DEFAULT_RELEASE_PROFILE, [], true).map((item) => item.title)
    ).toEqual(["Dishonored-CODEX"]);
  });
});

describe("Search Module - g4u.to indexers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeG4uIndexer = (overrides: Partial<Indexer> = {}): Indexer => ({
    id: "g4u-1",
    name: "g4u.to Indexer",
    url: "https://api.g4u.to/api",
    apiKey: "g4ukey",
    protocol: "g4u",
    enabled: true,
    priority: 1,
    categories: ["4000"],
    rssEnabled: true,
    autoSearchEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("routes g4u indexers through newznabClient, not torznabClient", async () => {
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([g4uIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: "test game" });

    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalled();
    expect(torznabClient.searchMultipleIndexers).not.toHaveBeenCalled();
  });

  it("transforms spaces to dots in query for g4u indexers", async () => {
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([g4uIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: "The Witcher 3" });

    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [g4uIndexer],
      expect.objectContaining({ query: "The.Witcher.3" })
    );
  });

  it("does not transform query for plain newznab indexers", async () => {
    const newznabIndexer = makeNewznabIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([newznabIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: "The Witcher 3" });

    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [newznabIndexer],
      expect.objectContaining({ query: "The Witcher 3" })
    );
  });

  it("excludes g4u indexers from torznab search", async () => {
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([g4uIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: "game" });

    expect(torznabClient.searchMultipleIndexers).not.toHaveBeenCalled();
  });

  it("searches all three protocol types when present", async () => {
    const torznabIndexer = makeTorznabIndexer();
    const newznabIndexer = makeNewznabIndexer();
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([
      torznabIndexer,
      newznabIndexer,
      g4uIndexer,
    ]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(makeTorznabResponse([]));
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: "some game" });

    expect(torznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [torznabIndexer],
      expect.any(Object)
    );
    // newznab and g4u each make a separate call
    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledTimes(2);
    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [newznabIndexer],
      expect.objectContaining({ query: "some game" })
    );
    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [g4uIndexer],
      expect.objectContaining({ query: "some.game" })
    );
  });

  it("returns g4u results as usenet downloadType", async () => {
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([g4uIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Game.Title.v1.0-SCENE",
          link: "http://g4u.to/nzb/123",
          publishDate: "2024-03-01T00:00:00Z",
          size: 5000000,
          grabs: 20,
          age: 1,
          category: ["4000"],
          guid: "g4u-guid-1",
          indexerId: "g4u-1",
          indexerName: "g4u.to Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "Game Title" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].downloadType).toBe("usenet");
    expect(result.items[0].title).toBe("Game.Title.v1.0-SCENE");
  });

  it("handles undefined query gracefully for g4u", async () => {
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([g4uIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: undefined });

    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [g4uIndexer],
      expect.objectContaining({ query: undefined })
    );
  });

  it("aggregates errors from g4u client failure into combined errors", async () => {
    const g4uIndexer = makeG4uIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([g4uIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockRejectedValue(
      new Error("g4u connection refused")
    );

    const result = await searchAllIndexers({ query: "game" });

    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("g4u connection refused");
  });
});

describe("filterBlacklistedReleases", () => {
  const makeItem = (title: string) => ({
    title,
    link: "http://example.com",
    downloadType: "torrent" as const,
  });

  it("returns all items when blacklist is empty", () => {
    const items = [makeItem("Game-GROUP"), makeItem("Game-OTHER")];
    expect(filterBlacklistedReleases(items, new Set())).toEqual(items);
  });

  it("filters out blacklisted titles", () => {
    const items = [makeItem("Game-GROUP"), makeItem("Game-OTHER")];
    const result = filterBlacklistedReleases(items, new Set(["Game-GROUP"]));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Game-OTHER");
  });

  it("returns empty array when all items are blacklisted", () => {
    const items = [makeItem("Game-A"), makeItem("Game-B")];
    const result = filterBlacklistedReleases(items, new Set(["Game-A", "Game-B"]));
    expect(result).toHaveLength(0);
  });

  it("is case-sensitive (does not filter non-matching case)", () => {
    const items = [makeItem("Game-GROUP")];
    const result = filterBlacklistedReleases(items, new Set(["game-group"]));
    expect(result).toHaveLength(1);
  });

  it("returns original array reference when blacklist is empty (fast path)", () => {
    const items = [makeItem("Game-GROUP")];
    const result = filterBlacklistedReleases(items, new Set());
    expect(result).toBe(items);
  });
});

describe("filterByReleaseNameBlacklist", () => {
  const makeItem = (title: string) => ({
    title,
    link: "http://example.com",
    downloadType: "torrent" as const,
  });

  it("returns all items when the term list is empty", () => {
    const items = [makeItem("Game-HYPERVISOR"), makeItem("Game-OTHER")];
    expect(filterByReleaseNameBlacklist(items, [])).toEqual(items);
  });

  it("returns original array reference when the term list is empty (fast path)", () => {
    const items = [makeItem("Game-HYPERVISOR")];
    expect(filterByReleaseNameBlacklist(items, [])).toBe(items);
  });

  it("filters out releases whose title contains a blacklisted term, case-insensitively", () => {
    const items = [makeItem("Game-HYPERVISOR"), makeItem("Game-OTHER")];
    const result = filterByReleaseNameBlacklist(items, ["hypervisor"]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Game-OTHER");
  });

  it("matches as a substring anywhere in the title", () => {
    const items = [makeItem("Some.Game.HYPERVISOR-GROUP")];
    expect(filterByReleaseNameBlacklist(items, ["HYPERVISOR"])).toHaveLength(0);
  });

  it("filters using any of multiple terms", () => {
    const items = [makeItem("Game-CODEX"), makeItem("Game-SKIDROW"), makeItem("Game-PLAZA")];
    const result = filterByReleaseNameBlacklist(items, ["codex", "skidrow"]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Game-PLAZA");
  });

  it("ignores blank terms", () => {
    const items = [makeItem("Game-A")];
    expect(filterByReleaseNameBlacklist(items, ["", "  "])).toEqual(items);
  });

  it("ignores whitespace-only terms against titles containing spaces", () => {
    const items = [makeItem("Some Game Deluxe Edition")];
    expect(filterByReleaseNameBlacklist(items, [" ", "\t"])).toEqual(items);
  });

  it("trims surrounding whitespace from terms before matching", () => {
    const items = [makeItem("Game-HYPERVISOR"), makeItem("Game-CODEX")];
    const result = filterByReleaseNameBlacklist(items, ["  hypervisor  "]);
    expect(result.map((item) => item.title)).toEqual(["Game-CODEX"]);
  });

  it("returns empty array when all items match a blacklisted term", () => {
    const items = [makeItem("Game-HYPERVISOR-1"), makeItem("Game-HYPERVISOR-2")];
    expect(filterByReleaseNameBlacklist(items, ["hypervisor"])).toHaveLength(0);
  });
});

describe("enrichWithAiAnalysis", () => {
  const makeItem = (title: string, overrides: Partial<SearchItem> = {}): SearchItem => ({
    title,
    link: "http://example.com",
    pubDate: "2024-01-01T00:00:00Z",
    indexerId: "idx-1",
    indexerName: "Indexer",
    category: [],
    guid: title,
    downloadType: "torrent",
    size: 5_000_000,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items unchanged when TypeSafe is not configured", async () => {
    vi.mocked(typesafeClient.isConfigured).mockResolvedValue(false);
    const items = [makeItem("Game-GROUP")];

    const result = await enrichWithAiAnalysis(items);

    expect(result).toBe(items);
    expect(typesafeClient.analyzeRelease).not.toHaveBeenCalled();
  });

  it("returns unmodified items when isConfigured() rejects (broken storage/decryption)", async () => {
    vi.mocked(typesafeClient.isConfigured).mockRejectedValue(new Error("storage unavailable"));
    const items = [makeItem("Game-GROUP")];

    const result = await enrichWithAiAnalysis(items);

    expect(result).toEqual(items);
  });

  it("leaves an item unchanged when its analyzeRelease call rejects", async () => {
    vi.mocked(typesafeClient.isConfigured).mockResolvedValue(true);
    vi.mocked(typesafeClient.analyzeRelease).mockRejectedValue(new Error("network error"));
    const items = [makeItem("Game-GROUP")];

    const result = await enrichWithAiAnalysis(items);

    expect(result[0]).toEqual(items[0]);
  });

  it("returns an empty array unchanged without calling isConfigured", async () => {
    const result = await enrichWithAiAnalysis([]);
    expect(result).toEqual([]);
    expect(typesafeClient.isConfigured).not.toHaveBeenCalled();
  });

  it("merges AI analysis fields onto matching items when configured", async () => {
    vi.mocked(typesafeClient.isConfigured).mockResolvedValue(true);
    vi.mocked(typesafeClient.analyzeRelease).mockResolvedValue({
      releaseType: "dlc",
      releaseTypeConfidence: 0.8,
      legitimacyScore: 0.3,
    });
    const items = [makeItem("Game-GROUP")];

    const result = await enrichWithAiAnalysis(items);

    expect(result[0]).toMatchObject({
      title: "Game-GROUP",
      aiReleaseType: "dlc",
      aiReleaseTypeConfidence: 0.8,
      aiLegitimacyScore: 0.3,
    });
  });

  it("leaves an item unchanged when its analysis call returns null", async () => {
    vi.mocked(typesafeClient.isConfigured).mockResolvedValue(true);
    vi.mocked(typesafeClient.analyzeRelease).mockResolvedValue(null);
    const items = [makeItem("Game-GROUP")];

    const result = await enrichWithAiAnalysis(items);

    expect(result[0]).toEqual(items[0]);
  });

  it("only analyzes the top 15 items, leaving the rest untouched", async () => {
    vi.mocked(typesafeClient.isConfigured).mockResolvedValue(true);
    vi.mocked(typesafeClient.analyzeRelease).mockResolvedValue({
      releaseType: "full_game",
      releaseTypeConfidence: 0.99,
      legitimacyScore: 0.95,
    });
    const items = Array.from({ length: 20 }, (_, i) => makeItem(`Game-${i}`));

    const result = await enrichWithAiAnalysis(items);

    expect(typesafeClient.analyzeRelease).toHaveBeenCalledTimes(15);
    expect(result[14].aiReleaseType).toBe("full_game");
    expect(result[15].aiReleaseType).toBeUndefined();
    expect(result[19].aiReleaseType).toBeUndefined();
  });
});
