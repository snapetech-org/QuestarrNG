import { type Indexer } from "../shared/schema.js";
import { XMLParser } from "fast-xml-parser";
import { torznabLogger } from "./logger.js";
import { safeFetch } from "./ssrf.js";
import { normalizeProwlarrUrl } from "./url-utils.js";

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

function extractXmlError(body: string): string {
  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(body) as {
      error?: string | { "#text"?: string; "@_description"?: string };
    };
    const error = parsed.error;
    if (typeof error === "string") return error;
    return error?.["@_description"] ?? error?.["#text"] ?? "";
  } catch {
    return "";
  }
}

const redactDiagnosticDetail = (value: string, apiKey: string): string => {
  let detail = value;
  if (apiKey.length >= 4) {
    for (const secret of [apiKey, encodeURIComponent(apiKey)]) {
      detail = detail.split(secret).join("[redacted]");
    }
  }
  return detail
    .replace(
      /(?:apikey|api[_-]?key|passkey|password|token|access_token)(?:=|%3d|:)\s*[^&\s"'<>]+/gi,
      "credential=[redacted]"
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .trim()
    .slice(0, 240);
};

interface ProwlarrIndexer {
  id: number;
  name: string;
  fields: Array<{ name: string; value?: string }>;
  implementationName: string;
  implementation: string;
  configContract: string;
  infoLink: string;
  message: {
    title: string;
    text: string;
    link: string;
  };
  tags: number[];
  added: string;
  appProfileId: number;
  protocol: string;
  priority: number;
  enable: boolean;
  indexerUrls: string[];
  apiKey?: string; // Sometimes exposed
}

/** Settings the user chose in the sync dialog, applied to every imported indexer. */
export interface ProwlarrSyncOverrides {
  allowInsecureLan?: boolean | undefined;
  priority?: number | undefined;
  categories?: string[] | undefined;
}

export class ProwlarrClient {
  /**
   * Fetch all indexers from Prowlarr and convert them to Questarr Indexer format
   */
  async getIndexers(
    prowlarrUrl: string,
    apiKey: string,
    overrides: ProwlarrSyncOverrides = {}
  ): Promise<Partial<Indexer>[]> {
    // Normalize URL
    const baseUrl = normalizeProwlarrUrl(prowlarrUrl);

    const apiUrl = `${baseUrl}/api/v1/indexer`;

    try {
      const protocol = new URL(apiUrl).protocol;
      const allowPlainHttp = protocol === "http:" && overrides.allowInsecureLan === true;
      if (protocol !== "https:" && !allowPlainHttp) {
        throw new Error("Refusing to send the Prowlarr API key over HTTP without explicit opt-in");
      }

      const response = await safeFetch(apiUrl, {
        headers: {
          "X-Api-Key": apiKey,
          "User-Agent": "Questarr/1.0",
        },
        signal: AbortSignal.timeout(30000),
        requireHttps: protocol === "https:",
        // Credentials are scoped to the configured endpoint, never redirect targets.
        redirect: "manual",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch indexers from Prowlarr: ${response.statusText}`);
      }

      const prowlarrIndexers = (await response.json()) as ProwlarrIndexer[];

      torznabLogger.info(
        {
          count: prowlarrIndexers.length,
          details: prowlarrIndexers.map((i) => ({
            name: i.name,
            protocol: i.protocol,
            appProfileId: i.appProfileId,
          })),
        },
        "Fetched indexers from Prowlarr"
      );

      // Filter for Torznab (torrent) and Newznab (usenet) compatible indexers
      // We accept both torrent and usenet protocol indexers.
      // appProfileId check removed as it might filter out valid indexers assigned to profiles.
      const compatibleIndexers = prowlarrIndexers.filter(
        (idx) => idx.protocol === "torrent" || idx.protocol === "usenet"
      );

      torznabLogger.info(
        {
          count: compatibleIndexers.length,
          torrent: compatibleIndexers.filter((i) => i.protocol === "torrent").length,
          usenet: compatibleIndexers.filter((i) => i.protocol === "usenet").length,
        },
        "Filtered compatible Torznab and Newznab indexers"
      );

      // Sending the key over plain HTTP needs the user's explicit opt-in from
      // the sync dialog; it is never inferred from the URL scheme. Left
      // undefined, an existing indexer keeps whatever it had.
      const { allowInsecureLan } = overrides;

      return compatibleIndexers.map((idx) => {
        // Construct Torznab/Newznab URL
        // Prowlarr exposes Torznab feed at /<indexerId>/api for torrents
        // and Newznab feed at /<indexerId>/api for usenet
        const indexerUrl = `${baseUrl}/${idx.id}/api`;

        // Determine protocol: torrent -> torznab, usenet -> newznab
        const protocol = idx.protocol === "usenet" ? "newznab" : "torznab";

        return {
          name: idx.name,
          url: indexerUrl,
          apiKey: apiKey, // Prowlarr uses the main API key for all indexer feeds by default
          protocol: protocol as "torznab" | "newznab",
          enabled: idx.enable,
          priority: overrides.priority ?? idx.priority,
          rssEnabled: true,
          autoSearchEnabled: true,
          ...(allowInsecureLan === undefined ? {} : { allowInsecureLan }),
          // Categories differ per indexer, so they are only set when the user
          // picked some in the dialog. Leaving them out keeps the categories
          // already chosen on an existing indexer instead of wiping them.
          ...(overrides.categories?.length ? { categories: overrides.categories } : {}),
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      torznabLogger.error(
        { error: errorMessage, url: redactDiagnosticDetail(prowlarrUrl, apiKey) },
        "Failed to sync from Prowlarr"
      );
      throw error;
    }
  }

  /**
   * Check the Prowlarr management API separately from each proxied feed.
   * Feed probes use a one-result search so an indexer's own HTTP 401 or
   * Torznab/Newznab error can be shown beside its name.
   */
  async diagnose(
    prowlarrUrl: string,
    apiKey: string,
    allowInsecureLan = false
  ): Promise<{
    management: {
      success: boolean;
      status?: number;
      version?: string;
      error?: string;
      errorSource?: string | null;
    };
    indexers: {
      id: number;
      name: string;
      success: boolean;
      status?: number;
      error?: string;
      errorSource?: string | null;
      layer: "indexer-feed";
    }[];
  }> {
    let baseUrl = stripTrailingSlashes(prowlarrUrl);
    if (!baseUrl.startsWith("http")) baseUrl = `http://${baseUrl}`;
    const headers = { "X-Api-Key": apiKey, "User-Agent": "Questarr/1.0" };
    const protocol = new URL(baseUrl).protocol;
    const allowPlainHttp = protocol === "http:" && allowInsecureLan;
    if (protocol !== "https:" && !allowPlainHttp) {
      return {
        management: {
          success: false,
          error:
            "Prowlarr uses plain HTTP; enable the insecure LAN option only on a trusted network.",
          errorSource:
            "Prowlarr uses plain HTTP; enable the insecure LAN option only on a trusted network.",
        },
        indexers: [],
      };
    }
    const safeOptions = {
      headers,
      allowPrivate: true,
      requireHttps: protocol === "https:",
      redirect: allowPlainHttp ? ("manual" as const) : ("follow" as const),
      timeoutMs: 15000,
    };
    let status: number | undefined;
    let version: string | undefined;
    let indexers: ProwlarrIndexer[];
    try {
      const systemResponse = await safeFetch(`${baseUrl}/api/v1/system/status`, safeOptions);
      status = systemResponse.status;
      if (!systemResponse.ok) {
        return {
          management: {
            success: false,
            status,
            error: `Prowlarr management API returned HTTP ${status}.`,
            errorSource: `Prowlarr management API returned HTTP ${status}.`,
          },
          indexers: [],
        };
      }
      const system = (await systemResponse.json()) as { version?: string };
      version = typeof system.version === "string" ? system.version.slice(0, 64) : undefined;
      const response = await safeFetch(`${baseUrl}/api/v1/indexer`, safeOptions);
      status = response.status;
      if (!response.ok) {
        return {
          management: {
            success: false,
            status,
            error: `Prowlarr indexer inventory returned HTTP ${status}.`,
            errorSource: `Prowlarr indexer inventory returned HTTP ${status}.`,
          },
          indexers: [],
        };
      }
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        return {
          management: {
            success: false,
            status,
            error: "Prowlarr returned an invalid indexer inventory.",
            errorSource: "Prowlarr returned an invalid indexer inventory.",
          },
          indexers: [],
        };
      }
      indexers = payload as ProwlarrIndexer[];
    } catch {
      return {
        management: {
          success: false,
          ...(status !== undefined ? { status } : {}),
          error: status
            ? `Prowlarr management API failed after HTTP ${status}.`
            : "Prowlarr management API could not be reached.",
          errorSource: status
            ? `Prowlarr management API failed after HTTP ${status}.`
            : "Prowlarr management API could not be reached.",
        },
        indexers: [],
      };
    }

    const active = indexers.filter(
      (item): item is ProwlarrIndexer =>
        Boolean(item) &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        item.enable &&
        (item.protocol === "torrent" || item.protocol === "usenet")
    );
    const results: {
      id: number;
      name: string;
      success: boolean;
      status?: number;
      error?: string;
      errorSource?: string | null;
      layer: "indexer-feed";
    }[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, active.length) }, async () => {
        while (cursor < active.length) {
          const indexer = active[cursor++];
          if (!indexer) continue;
          const name = String(indexer.name || `Indexer ${indexer.id}`).slice(0, 120);
          const feed = new URL(`${baseUrl}/${indexer.id}/api`);
          feed.searchParams.set("t", "search");
          feed.searchParams.set("q", "questarrng-indexer-diagnostic");
          feed.searchParams.set("limit", "1");
          feed.searchParams.set("apikey", apiKey);
          try {
            const response = await safeFetch(feed.toString(), safeOptions);
            const responseStatus = response.status;
            const body = (await response.text()).slice(0, 16384);
            const description = redactDiagnosticDetail(extractXmlError(body), apiKey);
            const htmlError =
              response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
              /<\s*html\b/i.test(body);
            const failed = !response.ok || /<error\b/i.test(body) || Boolean(htmlError);
            const error = failed
              ? description ||
                (htmlError
                  ? "Prowlarr feed returned an HTML page instead of an indexer response."
                  : `Prowlarr feed returned HTTP ${responseStatus}.`)
              : undefined;
            const errorSource = failed && !description ? error : null;
            results.push({
              id: indexer.id,
              name,
              success: !failed,
              status: responseStatus,
              ...(error ? { error, errorSource } : {}),
              layer: "indexer-feed",
            });
          } catch {
            results.push({
              id: indexer.id,
              name,
              success: false,
              error: "Prowlarr feed could not be reached.",
              errorSource: "Prowlarr feed could not be reached.",
              layer: "indexer-feed",
            });
          }
        }
      })
    );
    return {
      management: {
        success: true,
        ...(version ? { version } : {}),
      },
      indexers: results.sort((a, b) => a.id - b.id),
    };
  }
}

export const prowlarrClient = new ProwlarrClient();
