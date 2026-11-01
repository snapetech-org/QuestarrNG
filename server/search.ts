import {
  serviceMessage,
  serviceErrorValue,
  serviceMessageValue,
  parseServiceMessageDescriptor,
  type ServiceMessageDescriptor,
} from "../shared/service-messages.js";
import { jsonCatalogClient } from "./json-catalog.js";
import { storage } from "./storage.js";
import { torznabClient } from "./torznab.js";
import { newznabClient } from "./newznab.js";
import { searchLogger } from "./logger.js";
import { parseReleaseMetadata } from "../shared/title-utils.js";
import { typesafeClient, type ReleaseType } from "./typesafe.js";
import {
  evaluateReleases,
  type CustomFormat,
  type ReleaseContext,
  type ReleaseEvaluation,
  type ReleaseProfile,
} from "../shared/release-scoring.js";

// Cap how many top results get AI-enriched per search so an optional, user-supplied
// TypeSafe key never turns a single search into dozens of outbound API calls.
const AI_ENRICHMENT_MAX_ITEMS = 15;

export interface SearchItem {
  title: string;
  link: string;
  pubDate: string;
  size?: number;
  indexerId: string;
  indexerName: string;
  indexerUrl?: string;
  category: string[];
  guid: string;
  downloadType: "torrent" | "usenet";
  // Protocol-specific fields
  seeders?: number;
  leechers?: number;
  downloadVolumeFactor?: number;
  uploadVolumeFactor?: number;
  grabs?: number;
  age?: number;
  files?: number;
  poster?: string;
  group?: string;
  /** Lower is a higher-priority indexer, matching the user's indexer settings. */
  indexerPriority?: number;
  releaseEvaluation?: ReleaseEvaluation;
  comments?: string;
  // Optional AI-assisted enrichment via TypeSafe's Jev model (BYOK, best-effort).
  // Absent entirely when TypeSafe isn't configured or the call failed/timed out.
  aiReleaseType?: ReleaseType;
  aiReleaseTypeConfidence?: number;
  aiLegitimacyScore?: number;
}

export interface AggregatedSearchOptions {
  query: string;
  category?: string[] | undefined;
  limit?: number;
  offset?: number;
}

export interface AggregatedSearchResults {
  items: SearchItem[];
  total: number;
  offset: number;
  errors: string[];
  errorI18n?: Array<ServiceMessageDescriptor | null>;
}

export async function searchAllIndexers(
  options: AggregatedSearchOptions
): Promise<AggregatedSearchResults> {
  const enabledIndexers = await storage.getEnabledIndexers();

  if (enabledIndexers.length === 0) {
    const fragment = serviceMessage("service.no_indexers_configured", {});
    return {
      items: [],
      total: 0,
      offset: options.offset || 0,
      errors: [fragment.message],
      errorI18n: [parseServiceMessageDescriptor(fragment) ?? null],
    };
  }

  const torznabIndexers = enabledIndexers.filter(
    (i) => i.protocol !== "newznab" && i.protocol !== "g4u" && i.protocol !== "json-catalog"
  );
  const newznabIndexers = enabledIndexers.filter((i) => i.protocol === "newznab");
  // g4u.to uses the Newznab protocol but requires Scene-style dot-separated queries
  const g4uIndexers = enabledIndexers.filter((i) => i.protocol === "g4u");

  const searchParams = {
    query: options.query,
    category: options.category,
    limit: options.limit || 50,
    offset: options.offset || 0,
  };

  // g4u.to uses Scene-style dot-separated names (e.g. "Game.Name.v1.0")
  const g4uSearchParams = {
    ...searchParams,
    query: options.query ? options.query.replace(/ /g, ".") : options.query,
  };

  const promises = [];

  if (torznabIndexers.length > 0) {
    promises.push(
      torznabClient
        .searchMultipleIndexers(torznabIndexers, searchParams)
        .then((res) => ({ type: "torznab" as const, ...res }))
        .catch((err: unknown) => {
          const value = err instanceof Error ? serviceErrorValue(err) : String(err);
          const message = typeof value === "string" ? value : value.message;
          searchLogger.error({ error: message }, "torznab client failed");
          return {
            type: "torznab" as const,
            results: { items: [], total: 0, offset: 0 },
            errors: [message],
            errorI18n: [
              typeof value === "string" ? null : (parseServiceMessageDescriptor(value) ?? null),
            ],
          };
        })
    );
  }

  const makeNewznabPromise = (
    indexers: typeof newznabIndexers,
    params: typeof searchParams,
    label: string
  ) =>
    newznabClient
      .searchMultipleIndexers(indexers, params)
      .then((res) => ({ type: "newznab" as const, ...res }))
      .catch((err: unknown) => {
        const value = err instanceof Error ? serviceErrorValue(err) : String(err);
        const message = typeof value === "string" ? value : value.message;
        searchLogger.error({ error: message }, `${label} client failed`);
        return {
          type: "newznab" as const,
          results: { items: [], total: 0, offset: 0 },
          errors: [
            {
              indexer: label,
              error: message,
              errorI18n:
                typeof value === "string" ? null : (parseServiceMessageDescriptor(value) ?? null),
            },
          ],
        };
      });

  if (newznabIndexers.length > 0) {
    promises.push(makeNewznabPromise(newznabIndexers, searchParams, "newznab"));
  }

  if (g4uIndexers.length > 0) {
    promises.push(makeNewznabPromise(g4uIndexers, g4uSearchParams, "g4u"));
  }

  for (const indexer of enabledIndexers.filter((item) => item.protocol === "json-catalog")) {
    promises.push(
      jsonCatalogClient
        .search(indexer, searchParams)
        .then((results) => ({
          type: "catalog" as const,
          results,
          errors: [] as string[],
          errorI18n: [] as Array<ServiceMessageDescriptor | null>,
        }))
        .catch(() => {
          const fragment = serviceMessage("service.json_catalog_search_failed", {
            indexer: indexer.name,
          });
          return {
            type: "catalog" as const,
            results: { items: [] as SearchItem[], total: 0, offset: 0 },
            errors: [fragment.message],
            errorI18n: [parseServiceMessageDescriptor(fragment) ?? null],
          };
        })
    );
  }
  const results = await Promise.all(promises);

  const combinedItems: SearchItem[] = [];
  const combinedErrors: string[] = [];
  const combinedErrorI18n: Array<ServiceMessageDescriptor | null> = [];
  let totalCount = 0;

  for (const result of results) {
    if (result.type === "catalog") {
      combinedItems.push(...result.results.items);
      totalCount += result.results.total;
      result.errors.forEach((message, index) => {
        combinedErrors.push(message);
        combinedErrorI18n.push(result.errorI18n?.[index] ?? null);
      });
    } else if (result.type === "torznab") {
      const items = result.results.items.map((item) => {
        // Construct comments URL if not provided by the indexer.
        // This is a best-effort fallback based on common torrent indexer URL patterns.
        // Indexers should ideally provide the comments field directly in their Torznab responses
        // for more reliable links to the torrent page. The '/details/{guid}' pattern is a heuristic
        // that works for many popular indexers but may not work for all.
        let comments = item.comments;
        if (!comments && item.indexerUrl && item.guid) {
          try {
            const baseUrl = new URL(item.indexerUrl);
            const guid = item.guid.split("/").pop() || item.guid;
            comments = `${baseUrl.protocol}//${baseUrl.host}/details/${guid}`;
          } catch (error) {
            // If URL construction fails, log the error for debugging but continue
            searchLogger.warn(
              { error, indexerUrl: item.indexerUrl, guid: item.guid },
              "Failed to construct comments URL from indexer URL and GUID"
            );
          }
        }

        return {
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          size: item.size,
          indexerId: item.indexerId || "unknown",
          indexerName: item.indexerName || "unknown",
          indexerUrl: item.indexerUrl,
          category: item.category ? item.category.split(",") : [],
          guid: item.guid || item.link,
          downloadType: "torrent" as const,
          seeders: item.seeders,
          leechers: item.leechers,
          downloadVolumeFactor: item.downloadVolumeFactor,
          uploadVolumeFactor: item.uploadVolumeFactor,
          group: parseReleaseMetadata(item.title).group,
          comments,
        } as SearchItem;
      });
      combinedItems.push(...items);
      totalCount += result.results.total || 0;
      if (result.errors)
        result.errors.forEach((message, index) => {
          combinedErrors.push(message);
          combinedErrorI18n.push(result.errorI18n?.[index] ?? null);
        });
    } else if (result.type === "newznab") {
      const items = result.results.items.map(
        (item) =>
          ({
            title: item.title,
            link: item.link,
            pubDate: item.publishDate,
            size: item.size,
            indexerId: item.indexerId,
            indexerName: item.indexerName,
            category: item.category,
            guid: item.guid,
            downloadType: "usenet" as const,
            grabs: item.grabs,
            age: item.age,
            files: item.files,
            poster: item.poster,
            group: item.group,
          }) as SearchItem
      );
      combinedItems.push(...items);
      totalCount += result.results.total || 0;
      if (result.errors) {
        result.errors.forEach((e) => {
          const fragment = serviceMessage("service.downloader_named_error", {
            client: e.indexer,
            error: serviceMessageValue(e.error, e.errorI18n),
          });
          combinedErrors.push(fragment.message);
          combinedErrorI18n.push(parseServiceMessageDescriptor(fragment) ?? null);
        });
      }
    }
  }

  const priorityByIndexerId = new Map(
    enabledIndexers.map((indexer) => [indexer.id, indexer.priority])
  );
  const prioritizedItems: SearchItem[] = combinedItems.map((item) => {
    const indexerPriority = priorityByIndexerId.get(item.indexerId);
    return {
      ...item,
      ...(indexerPriority === undefined ? {} : { indexerPriority }),
    };
  });

  // Default sort: Date (newest first)
  prioritizedItems.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    return dateB - dateA;
  });

  return {
    items: prioritizedItems,
    total: totalCount,
    offset: options.offset || 0,
    errors: combinedErrors,
    ...(combinedErrorI18n.length ? { errorI18n: combinedErrorI18n } : {}),
  };
}

/** Scores one search batch and retains rejected items so manual search can explain the result. */
export function scoreSearchItems(
  items: SearchItem[],
  context: ReleaseContext,
  profile: ReleaseProfile,
  formats: readonly CustomFormat[] = [],
  acceptedOnly = false
): SearchItem[] {
  return evaluateReleases(items, context, profile, formats)
    .filter(({ evaluation }) => !acceptedOnly || evaluation.accepted)
    .map(({ item, evaluation }) => ({ ...item, releaseEvaluation: evaluation }));
}

/**
 * Filters search items by removing any whose title appears in the blacklist set.
 */
export function filterBlacklistedReleases(
  items: SearchItem[],
  blacklisted: Set<string>
): SearchItem[] {
  return blacklisted.size > 0 ? items.filter((item) => !blacklisted.has(item.title)) : items;
}

/**
 * Filters search items against the user's global release-name blacklist: a list of
 * case-insensitive substrings (e.g. "HYPERVISOR") to hide anywhere they appear in a
 * release's title. Unlike filterBlacklistedReleases (per-game, exact title match), this
 * applies to every search regardless of which game it's for, so it should run as early as
 * possible -- before AI (Jev) enrichment/auto-download analysis ever sees the release.
 */
export function filterByReleaseNameBlacklist(items: SearchItem[], terms: string[]): SearchItem[] {
  if (terms.length === 0) return items;
  const lowerTerms = terms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
  if (lowerTerms.length === 0) return items;
  return items.filter((item) => {
    const lowerTitle = item.title.toLowerCase();
    return !lowerTerms.some((term) => lowerTitle.includes(term));
  });
}

/**
 * Best-effort AI enrichment of search results via TypeSafe's Jev model: classifies each
 * release's type and flags whether its file size looks plausible. No-op when the user
 * hasn't configured a TypeSafe key/URL. Only the top `AI_ENRICHMENT_MAX_ITEMS` items are
 * analyzed to bound the number of outbound API calls per search; items beyond that (and
 * any whose call fails) are returned unchanged.
 */
export async function enrichWithAiAnalysis(items: SearchItem[]): Promise<SearchItem[]> {
  if (items.length === 0) {
    return items;
  }

  // Defensive: a broken TypeSafe config (unreachable storage, decrypt failure) must never
  // turn an otherwise-successful search into a 500 -- fall back to the unmodified results.
  try {
    if (!(await typesafeClient.isConfigured())) {
      return items;
    }

    const toAnalyze = items.slice(0, AI_ENRICHMENT_MAX_ITEMS);
    const analyses = await Promise.all(
      toAnalyze.map((item) =>
        typesafeClient
          .analyzeRelease({
            releaseName: item.title,
            sizeBytes: item.size,
            platform: parseReleaseMetadata(item.title).platform,
          })
          .catch(() => null)
      )
    );

    return items.map((item, index) => {
      const analysis = index < analyses.length ? analyses[index] : null;
      if (!analysis) return item;
      return {
        ...item,
        ...(analysis.releaseType ? { aiReleaseType: analysis.releaseType } : {}),
        ...(analysis.releaseTypeConfidence !== null
          ? { aiReleaseTypeConfidence: analysis.releaseTypeConfidence }
          : {}),
        ...(analysis.legitimacyScore !== null
          ? { aiLegitimacyScore: analysis.legitimacyScore }
          : {}),
      };
    });
  } catch (error) {
    searchLogger.warn({ error }, "AI enrichment failed, returning unmodified search results");
    return items;
  }
}
