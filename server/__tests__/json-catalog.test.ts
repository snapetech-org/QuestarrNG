import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Indexer } from "../../shared/schema.js";
import { insertIndexerSchema } from "../../shared/schema.js";

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("../ssrf.js", () => ({ safeFetch }));
import { jsonCatalogClient } from "../json-catalog.js";

const magnet = `magnet:?xt=urn:btih:${"a".repeat(40)}`;
let counter = 0;
const source = () =>
  ({
    id: `catalog-${++counter}`,
    name: "My catalog",
    url: `https://catalog.example/${counter}.json`,
    protocol: "json-catalog",
    apiKey: "",
  }) as Indexer;
const catalog = (
  downloads = [
    { title: "Example Game v2", uris: [magnet], fileSize: "1.5 GiB", uploadDate: "2026-01-02" },
  ]
) => Response.json({ name: "Catalog", downloads });

describe("JSON download catalogs", () => {
  beforeEach(() => safeFetch.mockReset());

  it("accepts a public catalog without an API key while existing protocols still require keys", () => {
    expect(insertIndexerSchema.safeParse(source()).success).toBe(true);
    expect(insertIndexerSchema.safeParse({ ...source(), protocol: "torznab" }).success).toBe(false);
  });

  it("searches and caches a catalog, retaining source provenance and accurate size", async () => {
    safeFetch.mockResolvedValueOnce(catalog());
    const indexer = source();
    const result = await jsonCatalogClient.search(indexer, { query: "Example Game" });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      title: "Example Game v2",
      link: magnet,
      size: 1610612736,
      indexerId: indexer.id,
      indexerName: indexer.name,
      downloadType: "torrent",
      category: [],
    });
    expect(safeFetch).toHaveBeenCalledWith(
      indexer.url,
      expect.objectContaining({
        allowPrivate: false,
        requireHttps: true,
        headers: { Accept: "application/json" },
      })
    );
    expect(await jsonCatalogClient.search(indexer, { query: "Unrelated" })).toMatchObject({
      items: [],
      total: 0,
    });
    expect(safeFetch).toHaveBeenCalledTimes(1);
    safeFetch.mockResolvedValueOnce(catalog([]));
    expect(await jsonCatalogClient.testConnection(indexer)).toMatchObject({
      success: true,
      messageKey: "service.json_catalog_valid",
      messageValues: { count: 0 },
    });
    expect(await jsonCatalogClient.search(indexer, { query: "Example" })).toMatchObject({
      total: 0,
    });
  });

  it("discards non-torrent links and duplicate URIs without treating unknown size as zero", async () => {
    safeFetch.mockResolvedValueOnce(
      catalog([
        {
          title: "Example Game",
          uris: [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://example.com/game.exe",
            "magnet:?xt=invalid",
            magnet,
            magnet,
          ],
          fileSize: "Unknown",
          uploadDate: "invalid",
        },
      ])
    );
    const result = await jsonCatalogClient.search(source(), { query: "Example" });
    expect(result.total).toBe(1);
    expect(result.items[0]?.size).toBeUndefined();
    expect(result.items[0]?.pubDate).toBe(new Date(0).toISOString());
  });

  it.each([
    "http://catalog.example/file.json",
    "https://user:password@catalog.example/file.json",
    "file:///tmp/catalog.json",
  ])("rejects unsafe source configuration %s before fetching", async (url) => {
    expect(await jsonCatalogClient.testConnection({ ...source(), url })).toMatchObject({
      success: false,
    });
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("does not cache malformed responses, and propagates safeFetch policy failures", async () => {
    const indexer = source();
    safeFetch.mockResolvedValueOnce(
      Response.json({ downloads: [{ title: "Game", uris: "not a list" }] })
    );
    await expect(jsonCatalogClient.search(indexer, { query: "Game" })).rejects.toThrow(
      "Invalid JSON catalog"
    );
    safeFetch.mockRejectedValueOnce(new Error("Invalid or unsafe URL"));
    expect(await jsonCatalogClient.testConnection(indexer)).toEqual({
      success: false,
      message: "Invalid or unsafe URL",
    });
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it("limits streamed bodies even without Content-Length", async () => {
    safeFetch.mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024 + 1)));
    expect(await jsonCatalogClient.testConnection(source())).toEqual({
      success: false,
      message: "Catalog exceeds the 10 MiB limit",
    });
  });

  it("paginates newest-first and deduplicates links across catalog entries", async () => {
    safeFetch.mockResolvedValueOnce(
      catalog([
        { title: "Example Game v1", uris: [magnet], fileSize: "1 GB", uploadDate: "2025-01-01" },
        {
          title: "Example Game v2",
          uris: ["https://example.com/game.torrent"],
          fileSize: "2 GB",
          uploadDate: "2026-01-01",
        },
      ])
    );
    const result = await jsonCatalogClient.search(source(), {
      query: "Example",
      offset: 1,
      limit: 1,
    });
    expect(result.total).toBe(2);
    expect(result.items[0]?.title).toBe("Example Game v1");
  });
});
