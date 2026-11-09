import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { prowlarrClient } from "../prowlarr.js";

// Mock logger
vi.mock("../ssrf.js", () => ({
  isSafeUrl: vi.fn().mockResolvedValue(true),
  safeFetch: vi.fn((url, options) => fetch(url, options)) as Mock,
}));

vi.mock("../logger.js", () => ({
  torznabLogger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ProwlarrClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const mockProwlarrIndexers = [
    {
      id: 1,
      name: "Torrent Indexer",
      protocol: "torrent",
      enable: true,
      priority: 1,
      appProfileId: 1,
      indexerUrls: ["http://prowlarr:9696/1/api"],
    },
    {
      id: 2,
      name: "Usenet Indexer",
      protocol: "usenet",
      enable: true,
      priority: 2,
      appProfileId: 1,
      indexerUrls: ["http://prowlarr:9696/2/api"],
    },
    {
      id: 3,
      name: "Unsupported Indexer",
      protocol: "something_else",
      enable: true,
      priority: 3,
      appProfileId: 1,
      indexerUrls: ["http://prowlarr:9696/3/api"],
    },
  ];

  it("should fetch and map indexers correctly", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockProwlarrIndexers,
    });

    const indexers = await prowlarrClient.getIndexers("http://prowlarr:9696", "apikey123", {
      allowInsecureLan: true,
    });

    expect(indexers).toHaveLength(2); // Should filter out "Unsupported Indexer"

    const torrentIndexer = indexers.find((i) => i.name === "Torrent Indexer");
    expect(torrentIndexer).toBeDefined();
    expect(torrentIndexer?.protocol).toBe("torznab");
    expect(torrentIndexer?.url).toBe("http://prowlarr:9696/1/api");
    expect(torrentIndexer?.apiKey).toBe("apikey123");

    const usenetIndexer = indexers.find((i) => i.name === "Usenet Indexer");
    expect(usenetIndexer).toBeDefined();
    expect(usenetIndexer?.protocol).toBe("newznab");
    expect(usenetIndexer?.url).toBe("http://prowlarr:9696/2/api");
  });

  it("should handle Prowlarr API errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: "Unauthorized",
    });

    await expect(prowlarrClient.getIndexers("https://prowlarr:9696", "bad_key")).rejects.toThrow(
      "Failed to fetch indexers from Prowlarr: Unauthorized"
    );
  });

  it("should normalize Prowlarr URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await prowlarrClient.getIndexers("prowlarr:9696/", "key", {
      allowInsecureLan: true,
    }); // Missing http, trailing slash

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toBe("http://prowlarr:9696/api/v1/indexer");
  });

  const response = (options: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    json?: unknown;
    body?: string;
    contentType?: string;
  }) => ({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    json: async () => options.json,
    text: async () => options.body ?? "",
    headers: new Headers(options.contentType ? { "content-type": options.contentType } : undefined),
  });

  it("reports management API HTTP errors without probing feeds", async () => {
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401 }));

    await expect(prowlarrClient.diagnose("prowlarr:9696/", "secret", true)).resolves.toMatchObject({
      management: {
        success: false,
        status: 401,
        error: "Prowlarr management API returned HTTP 401.",
      },
      indexers: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://prowlarr:9696/api/v1/system/status");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      requireHttps: false,
      redirect: "manual",
      allowPrivate: true,
    });
  });

  it("reports inventory HTTP errors and invalid inventory payloads", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ json: { version: "1.0" } }))
      .mockResolvedValueOnce(response({ ok: false, status: 503 }));
    await expect(prowlarrClient.diagnose("https://prowlarr", "key")).resolves.toMatchObject({
      management: {
        success: false,
        status: 503,
        error: "Prowlarr indexer inventory returned HTTP 503.",
      },
      indexers: [],
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ requireHttps: true });

    fetchMock
      .mockResolvedValueOnce(response({ json: { version: "1.2" } }))
      .mockResolvedValueOnce(response({ json: { indexers: [] } }));
    await expect(prowlarrClient.diagnose("https://prowlarr", "key")).resolves.toMatchObject({
      management: {
        success: false,
        error: "Prowlarr returned an invalid indexer inventory.",
      },
      indexers: [],
    });
  });

  it("reports management network failures before and after a response", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(prowlarrClient.diagnose("prowlarr", "key", true)).resolves.toMatchObject({
      management: {
        success: false,
        error: "Prowlarr management API could not be reached.",
      },
      indexers: [],
    });

    fetchMock.mockResolvedValueOnce(response({ json: { version: "1" } }));
    fetchMock.mockRejectedValueOnce(new Error("indexer request failed"));
    await expect(prowlarrClient.diagnose("prowlarr", "key", true)).resolves.toMatchObject({
      management: {
        success: false,
        status: 200,
        error: "Prowlarr management API failed after HTTP 200.",
      },
      indexers: [],
    });
  });

  it("probes active feeds, sorts results, and redacts feed errors", async () => {
    const inventory = [
      { id: 4, name: "HTML", enable: true, protocol: "torrent" },
      { id: 3, name: "Offline", enable: true, protocol: "usenet" },
      { id: 2, name: "XML", enable: true, protocol: "torrent" },
      { id: 1, name: "Good", enable: true, protocol: "usenet" },
      { id: 5, name: "HTTP failure", enable: true, protocol: "torrent" },
      { id: 6, name: "Disabled", enable: false, protocol: "torrent" },
      { id: 0, name: "Invalid id", enable: true, protocol: "torrent" },
      { id: 7, name: "Unsupported", enable: true, protocol: "other" },
    ];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/v1/system/status")) {
        return response({ json: { version: "v".repeat(80) } });
      }
      if (url.endsWith("/api/v1/indexer")) return response({ json: inventory });
      const parsed = new URL(url);
      const id = Number(parsed.pathname.split("/").at(-2));
      if (id === 1) return response({ body: "<rss><channel><item /></channel></rss>" });
      if (id === 2) {
        return response({
          body: '<error code="1" description="bad apikey=secret and https://private.example/path" />',
        });
      }
      if (id === 4) return response({ body: "<html>login</html>", contentType: "text/html" });
      if (id === 5) return response({ ok: false, status: 502 });
      throw new Error("feed offline");
    });

    const result = await prowlarrClient.diagnose("http://prowlarr:9696", "secret", true);

    expect(result.management).toEqual({ success: true, version: "v".repeat(64) });
    expect(result.indexers.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.indexers[0]).toMatchObject({ success: true, status: 200 });
    expect(result.indexers[1]).toMatchObject({
      success: false,
      status: 200,
      error: "bad credential=[redacted] and [URL]",
    });
    expect(result.indexers[2]).toMatchObject({
      success: false,
      error: "Prowlarr feed could not be reached.",
    });
    expect(result.indexers[3]).toMatchObject({
      success: false,
      error: "Prowlarr feed returned an HTML page instead of an indexer response.",
    });
    expect(result.indexers[4]).toMatchObject({
      success: false,
      status: 502,
      error: "Prowlarr feed returned HTTP 502.",
    });
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        requireHttps: false,
        redirect: "manual",
        allowPrivate: true,
      });
    }
  });

  it("returns a successful empty-feed diagnosis when no indexers are active", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ json: { version: "" } }))
      .mockResolvedValueOnce(
        response({ json: [null, { id: 1, enable: false }, { id: -1, enable: true }] })
      );

    await expect(prowlarrClient.diagnose("https://prowlarr", "key")).resolves.toMatchObject({
      management: { success: true },
      indexers: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves allow-insecure LAN and logs non-Error sync failures", async () => {
    fetchMock.mockResolvedValueOnce(response({ json: [mockProwlarrIndexers[0]] }));
    const indexers = await prowlarrClient.getIndexers("http://prowlarr", "key", {
      allowInsecureLan: true,
    });
    expect(indexers[0]?.allowInsecureLan).toBe(true);

    fetchMock.mockRejectedValueOnce("connection refused");
    await expect(prowlarrClient.getIndexers("https://prowlarr", "key")).rejects.toBe(
      "connection refused"
    );
  });

  it("does not infer the insecure LAN opt-in for indexer feeds", async () => {
    await expect(prowlarrClient.getIndexers("http://prowlarr:9696", "apikey123")).rejects.toThrow(
      "Refusing to send the Prowlarr API key over HTTP without explicit opt-in"
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => mockProwlarrIndexers });

    const indexers = await prowlarrClient.getIndexers("https://prowlarr:9696", "apikey123");

    expect(indexers.every((i) => !("allowInsecureLan" in i))).toBe(true);
  });

  it("applies an explicit insecure LAN opt-in to every indexer", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => mockProwlarrIndexers });

    const indexers = await prowlarrClient.getIndexers("http://prowlarr:9696", "apikey123", {
      allowInsecureLan: true,
    });

    expect(indexers.map((i) => i.allowInsecureLan)).toEqual([true, true]);
  });

  it("applies the sync dialog's global settings to every indexer", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => mockProwlarrIndexers });

    const indexers = await prowlarrClient.getIndexers("https://prowlarr:9696", "apikey123", {
      allowInsecureLan: false,
      priority: 7,
      categories: ["4050"],
    });

    for (const indexer of indexers) {
      expect(indexer.allowInsecureLan).toBe(false);
      expect(indexer.priority).toBe(7);
      expect(indexer.categories).toEqual(["4050"]);
    }
  });

  it("leaves categories out when none were chosen, so a re-sync keeps them", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => mockProwlarrIndexers });

    const indexers = await prowlarrClient.getIndexers("https://prowlarr:9696", "apikey123");

    expect(indexers.every((i) => !("categories" in i))).toBe(true);
    expect(indexers.map((i) => i.priority)).toEqual([1, 2]);
  });
});
