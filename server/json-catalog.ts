import { serviceMessage } from "../shared/service-messages.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Indexer } from "../shared/schema.js";
import type { AggregatedSearchOptions, SearchItem } from "./search.js";
import { safeFetch } from "./ssrf.js";

const MAX_BYTES = 10 * 1024 * 1024;
const catalogSchema = z.object({
  name: z.string().max(500).optional(),
  downloads: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        uris: z.array(z.string().max(8192)).max(20),
        uploadDate: z.string().max(100).optional(),
        fileSize: z.union([z.string().max(100), z.number().nonnegative().finite()]).optional(),
      })
    )
    .max(50000),
});
type Catalog = z.infer<typeof catalogSchema>;
const cache = new Map<string, { until: number; catalog: Catalog }>();

async function readCatalog(url: string, refresh = false): Promise<Catalog> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("JSON catalogs require a public HTTPS URL without embedded credentials");
  }
  const cached = cache.get(parsed.href);
  if (!refresh && cached && cached.until > Date.now()) return cached.catalog;
  const response = await safeFetch(parsed.href, {
    allowPrivate: false,
    requireHttps: true,
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Catalog returned HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Catalog exceeds the 10 MiB limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  let catalog: Catalog;
  try {
    catalog = catalogSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new Error("Invalid JSON catalog: expected downloads with titles and URI lists");
  }
  // Bound both response size and cache cardinality; a changed URL cannot reuse old data.
  cache.delete(parsed.href);
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(parsed.href, { until: Date.now() + 5 * 60 * 1000, catalog });
  return catalog;
}

function torrentUri(value: string): boolean {
  try {
    const uri = new URL(value);
    if (uri.username || uri.password) return false;
    if (uri.protocol === "magnet:") {
      return uri.searchParams
        .getAll("xt")
        .some((xt) => /^urn:btih:(?:[a-f\d]{40}|[a-z2-7]{32})$/i.test(xt));
    }
    return uri.protocol === "https:" && uri.pathname.toLowerCase().endsWith(".torrent");
  } catch {
    return false;
  }
}

function sizeBytes(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return value;
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)?$/i);
  if (!match) return undefined;
  const unit = (match[2] ?? "B").toUpperCase();
  const power = "BKMGT".indexOf(unit[0]!);
  const bytes = Number(match[1]) * (unit.includes("I") ? 1024 : 1000) ** power;
  return Number.isSafeInteger(Math.round(bytes)) ? Math.round(bytes) : undefined;
}

const words = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const jsonCatalogClient = {
  async testConnection(indexer: Indexer) {
    try {
      const catalog = await readCatalog(indexer.url, true);
      return {
        success: true,
        ...serviceMessage("service.json_catalog_valid", { count: catalog.downloads.length }),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Catalog request failed",
      };
    }
  },
  async search(indexer: Indexer, options: AggregatedSearchOptions) {
    const catalog = await readCatalog(indexer.url);
    const query = words(options.query).split(" ").filter(Boolean);
    const matches: SearchItem[] = [];
    const seen = new Set<string>();
    for (const release of catalog.downloads) {
      const title = words(release.title);
      if (!query.every((word) => title.includes(word))) continue;
      for (const link of release.uris.filter(torrentUri)) {
        if (seen.has(link)) continue;
        seen.add(link);
        const size = sizeBytes(release.fileSize);
        matches.push({
          title: release.title,
          link,
          guid: createHash("sha256").update(link).digest("hex"),
          pubDate:
            release.uploadDate && Number.isFinite(Date.parse(release.uploadDate))
              ? new Date(release.uploadDate).toISOString()
              : new Date(0).toISOString(),
          ...(size === undefined ? {} : { size }),
          indexerId: indexer.id,
          indexerName: indexer.name,
          category: [],
          downloadType: "torrent",
        });
      }
    }
    matches.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
    const offset = Math.max(0, options.offset ?? 0);
    return {
      items: matches.slice(offset, offset + Math.min(100, Math.max(1, options.limit ?? 50))),
      total: matches.length,
      offset,
    };
  },
};
