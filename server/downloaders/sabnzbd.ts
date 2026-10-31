import { serviceMessage } from "../../shared/service-messages.js";
import type { Downloader, DownloadStatus, DownloadDetails } from "../../shared/schema.js";
import { resolveArchivePassword } from "../../shared/archive-password.js";
import { downloadersLogger } from "../logger.js";
import { isSafeUrl, safeFetch } from "../ssrf.js";
import type { DownloadRequest, DownloaderClient } from "./types.js";
import {
  assertCredentialsAllowed,
  fixNzbUrlEncoding,
  isHttpsUrl,
  logDownloaderDebugResponse,
  stripTrailingPathSeparators,
  findTorrentByTagNull,
} from "./utils.js";

/**
 * Strips the `apikey` query param from a SABnzbd request URL before it's
 * passed to a logger -- getApiUrl() embeds the credential directly in the
 * URL, so logging it unredacted would leak the API key into log output.
 */
function redactApiKey(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("apikey")) {
      parsed.searchParams.set("apikey", "[redacted]");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

interface SABnzbdQueue {
  slots: Array<{
    nzo_id: string;
    filename: string;
    status: string;
    percentage: string;
    mb: string;
    mbleft: string;
    mbmissing: string;
    size: string;
    sizeleft: string;
    timeleft: string;
    eta: string;
    cat: string;
    priority: string;
    script: string;
    avg_age: string;
  }>;
  speed: string;
  size: string;
  sizeleft: string;
  mb: string;
  mbleft: string;
  noofslots: number;
  status: string;
  timeleft: string;
}

interface SABnzbdHistory {
  slots: Array<{
    nzo_id: string;
    name: string;
    status: string;
    fail_message: string;
    path: string;
    storage?: string;
    size: string;
    bytes: number;
    category: string;
    download_time: number;
    completed: number;
    action_line: string;
    stage_log: Array<{
      name: string;
      actions: string[];
    }>;
  }>;
}

export class SABnzbdClient implements DownloaderClient {
  private downloader: Downloader;

  constructor(downloader: Downloader) {
    this.downloader = downloader;
  }

  private getBaseUrl(): string {
    let baseUrl = this.downloader.url;
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      const protocol = this.downloader.useSsl ? "https://" : "http://";
      baseUrl = protocol + baseUrl;
    }

    try {
      const urlObj = new URL(baseUrl);
      if (this.downloader.port) {
        urlObj.port = this.downloader.port.toString();
      }
      return urlObj.toString().replace(/\/$/, "");
    } catch {
      return baseUrl.replace(/\/$/, "");
    }
  }

  /**
   * Builds a SABnzbd API URL, including the configured API key when permitted.
   *
   * @throws When an API key is configured but the transport policy forbids sending it.
   */
  private getApiUrl(mode: string, params: Record<string, string> = {}): string {
    const baseUrl = this.getBaseUrl();

    let apiPath = "/api";
    if (this.downloader.urlPath) {
      const path = this.downloader.urlPath.startsWith("/")
        ? this.downloader.urlPath
        : `/${this.downloader.urlPath}`;
      apiPath = `${path.replace(/\/$/, "")}/api`;
    }

    const url = new URL(`${baseUrl}${apiPath}`);
    if (this.downloader.username) {
      assertCredentialsAllowed(this.downloader, baseUrl, "SABnzbd", "API key");
      url.searchParams.set("apikey", this.downloader.username);
    }
    url.searchParams.set("mode", mode);
    url.searchParams.set("output", "json");

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  private async fetchWithFallback(
    url: string,
    options: RequestInit = {},
    requireHttps = false
  ): Promise<Response> {
    const response = await this.doFetchWithFallback(url, options, requireHttps);
    await logDownloaderDebugResponse("sabnzbd", options.method ?? "GET", url, response);
    return response;
  }

  private async doFetchWithFallback(
    url: string,
    options: RequestInit = {},
    requireHttps = false
  ): Promise<Response> {
    try {
      // API keys are embedded in SABnzbd request URLs. Keep redirects on HTTPS
      // whenever TLS is configured, and also when the request carries an archive
      // password and explicitly requires HTTPS.
      return await safeFetch(url, {
        ...options,
        allowPrivate: true,
        requireHttps: requireHttps || isHttpsUrl(url),
      });
    } catch (error) {
      if (this.downloader.allowSelfSignedCertificate && isHttpsUrl(url)) {
        downloadersLogger.warn(
          { url: redactApiKey(url), downloaderId: this.downloader.id },
          "TLS certificate verification failed. Configure the trusted certificate with " +
            "NODE_EXTRA_CA_CERTS; certificate validation cannot be disabled."
        );
      }
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const data = await this.getVersionInfo();
      if (data.version) {
        return {
          success: true,
          ...serviceMessage("service.connected_version", {
            client: "SABnzbd",
            version: String(data.version),
          }),
        };
      }

      return { success: false, message: "Invalid SABnzbd response - missing version field" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const baseUrl = this.getBaseUrl();
      downloadersLogger.error({ error, url: baseUrl }, "SABnzbd connection test failed");
      return {
        success: false,
        ...serviceMessage("service.connection_failed_at", {
          client: "SABnzbd",
          url: baseUrl,
          error: errorMessage,
        }),
      };
    }
  }

  async logVersionInfo(): Promise<void> {
    const data = await this.getVersionInfo();
    if (!data.version) {
      downloadersLogger.debug(
        { downloaderId: this.downloader.id, downloaderType: this.downloader.type },
        "SABnzbd version endpoint did not expose version info"
      );
      return;
    }

    downloadersLogger.info(
      {
        downloaderId: this.downloader.id,
        downloaderType: this.downloader.type,
        version: data.version,
      },
      "Downloader version probe completed"
    );
  }

  private async getVersionInfo(): Promise<Record<string, unknown>> {
    const url = this.getApiUrl("version");
    downloadersLogger.debug({ url: redactApiKey(url) }, "Testing SABnzbd connection");
    const response = await this.fetchWithFallback(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error details");
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private parseAddFileResponse(data: { status?: boolean; nzo_ids?: string[]; error?: string }): {
    success: boolean;
    id?: string;
    message: string;
  } {
    if (data.status === true) {
      const [nzoId] = data.nzo_ids ?? [];
      if (nzoId) {
        return { success: true, id: nzoId, message: "NZB added successfully" };
      }
      // Status true but no ID usually means duplicate in SABnzbd (or merged)
      return { success: true, message: "NZB added successfully (likely duplicate or merged)" };
    }

    // Check for specific duplicate error
    if (
      data.error &&
      typeof data.error === "string" &&
      data.error.toLowerCase().includes("duplicate")
    ) {
      return { success: true, message: `NZB already exists: ${data.error}` };
    }

    return {
      success: false,
      message: data.error || "Failed to add NZB - SABnzbd returned success:false",
    };
  }

  async addDownload(
    request: DownloadRequest
  ): Promise<{ success: boolean; id?: string; message: string }> {
    if (!(await isSafeUrl(request.url))) {
      return { success: false, message: `Unsafe URL blocked: ${request.url}` };
    }

    try {
      // Fetch the NZB in Questarr and upload via addfile so SABnzbd never needs
      // direct indexer access. Keep &file= intact — Prowlarr uses it for link validation.
      const nzbUrl = fixNzbUrlEncoding(request.url);
      const nzbResponse = await safeFetch(nzbUrl);
      if (!nzbResponse.ok) {
        return { success: false, message: `Failed to fetch NZB: ${nzbResponse.statusText}` };
      }
      const nzbContent = await nzbResponse.arrayBuffer();

      // Many usenet releases (e.g. G4U) ship as password-protected archives. SABnzbd
      // can unpack them automatically if we hand it the extraction password up front —
      // configured per-downloader since it's usually a fixed indexer/group convention.
      const { password, error: passwordError } = resolveArchivePassword(
        request.password,
        this.downloader.settings,
        this.getBaseUrl(),
        "SABnzbd"
      );
      if (passwordError) {
        return { success: false, message: passwordError };
      }

      const url = this.getApiUrl("addfile", {
        nzbname: request.title,
        cat: request.category || this.downloader.category || "games",
        priority: (request.priority || 0).toString(),
        ...(password ? { password } : {}),
      });

      // Build the multipart body explicitly so its filename remains stable across
      // Node's fetch implementations.
      const boundary = `questarr${Date.now().toString(16)}`;
      const safeName = request.title.replace(/["\\]/g, "_");
      const multipartBody = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="name"; filename="${safeName}.nzb"\r\nContent-Type: application/x-nzb\r\n\r\n`
        ),
        Buffer.from(nzbContent),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const response = await this.fetchWithFallback(
        url,
        {
          method: "POST",
          body: multipartBody,
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
          signal: AbortSignal.timeout(30000),
        },
        Boolean(password)
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "No error details");
        return { success: false, message: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return this.parseAddFileResponse(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to add NZB to SABnzbd: ${errorMessage}`,
      };
    }
  }

  async getDownloadStatus(
    id: string,
    options?: { throwOnError?: boolean }
  ): Promise<DownloadStatus | null> {
    try {
      const url = this.getApiUrl("queue");
      const response = await this.fetchWithFallback(url);
      const data = await response.json();
      const queue: SABnzbdQueue = data.queue;

      const item = queue.slots.find((slot) => slot.nzo_id === id);
      if (!item) {
        // Check history if not in queue
        downloadersLogger.debug(
          { id, queueSize: queue.slots.length },
          "SABnzbd: item not in queue, checking history"
        );
        return await this.getFromHistory(id, options);
      }

      const progress = parseFloat(item.percentage) || 0;
      const totalMB = parseFloat(item.mb) || 0;
      const leftMB = parseFloat(item.mbleft) || 0;
      const downloadedMB = totalMB - leftMB;

      // Parse ETA (format: "HH:MM:SS" or "00:00:00" or "unknown")
      let eta: number | undefined;
      if (item.timeleft && item.timeleft !== "0:00:00" && item.timeleft !== "unknown") {
        const [hours, minutes, seconds] = item.timeleft.split(":").map(Number);
        if (hours !== undefined && minutes !== undefined && seconds !== undefined) {
          eta = hours * 3600 + minutes * 60 + seconds;
        }
      }

      // Map SABnzbd status to our status
      let status: DownloadStatus["status"];
      let repairStatus: DownloadStatus["repairStatus"];
      let unpackStatus: DownloadStatus["unpackStatus"];

      switch (item.status.toLowerCase()) {
        case "downloading":
        case "fetching":
          status = "downloading";
          break;
        case "paused":
          status = "paused";
          break;
        case "repairing":
          status = "repairing";
          repairStatus = "repairing";
          break;
        case "extracting":
        case "unpacking":
          status = "unpacking";
          unpackStatus = "unpacking";
          break;
        case "completed":
          status = "completed";
          repairStatus = "good";
          unpackStatus = "completed";
          break;
        case "failed":
          status = "error";
          repairStatus = "failed";
          break;
        default:
          status = "downloading";
      }

      return {
        id: item.nzo_id,
        name: item.filename,
        downloadType: "usenet",
        status,
        progress,
        downloadSpeed: (parseFloat(queue.speed) || 0) * 1024 * 1024, // Convert MB/s to bytes/s
        eta,
        size: totalMB * 1024 * 1024, // Convert MB to bytes
        downloaded: downloadedMB * 1024 * 1024,
        category: item.cat,
        repairStatus,
        unpackStatus,
        age: parseFloat(item.avg_age) || undefined,
      };
    } catch (error) {
      downloadersLogger.error({ error }, "Failed to get SABnzbd status");
      if (options?.throwOnError) throw error;
      return null;
    }
  }

  // A large-but-bounded page size for the unfiltered history fallback below.
  // SABnzbd's `mode=history` API silently caps an unfiltered request at the
  // user's configured "history_limit" (commonly as low as 10-60) whenever
  // `limit` is omitted or falsy -- it does NOT mean "unlimited". A job that's
  // older than that cap is invisible to the fallback scan unless we ask for a
  // page large enough to contain it.
  private static readonly HISTORY_FALLBACK_LIMIT = "1000";

  // SABnzbd moves finished jobs out of its "active" history into a separate
  // "archive" bucket once the configured history retention (job count/age) is
  // exceeded -- see auto_history_purge() in SABnzbd's database layer. The
  // `mode=history` API only ever searches one bucket per request (`archive IS
  // NULL` vs `archive = 1`, selected by the `archive` param), so a job that has
  // aged into the archive is completely invisible to a request that omits
  // `archive=1` -- nzo_ids filtering does NOT search across both. Since we don't
  // know ahead of time which bucket a given id is in, both are checked here, and
  // each is also retried with a full unfiltered scan (in case `nzo_ids`
  // filtering isn't supported, or simply doesn't match on this SABnzbd
  // instance) using a large explicit `limit` so the job isn't missed just for
  // being older than the default page.
  private async fetchHistorySlot(
    id: string,
    options?: { throwOnError?: boolean }
  ): Promise<SABnzbdHistory["slots"][number] | null> {
    // Tracks whether ANY attempt actually reached SABnzbd and got a response
    // (even an empty/non-matching one). If every single attempt threw --
    // e.g. the downloader is unreachable -- a `null` return would look
    // identical to "confirmed not in history", which is wrong: we simply
    // couldn't check. In that case, callers that asked for `throwOnError`
    // get the last error instead of a false "not found".
    let sawCleanResponse = false;
    let lastError: unknown;

    for (const archive of [false, true]) {
      for (const useFilter of [true, false]) {
        try {
          const params: Record<string, string> = {
            ...(useFilter ? { nzo_ids: id } : { limit: SABnzbdClient.HISTORY_FALLBACK_LIMIT }),
            ...(archive ? { archive: "1" } : {}),
          };
          const url = this.getApiUrl("history", params);
          downloadersLogger.debug({ id, useFilter, archive }, "SABnzbd: fetching history");
          const response = await this.fetchWithFallback(url);
          const data = await response.json();
          sawCleanResponse = true;
          const history: SABnzbdHistory = data.history;

          if (!history?.slots) {
            downloadersLogger.debug(
              { id, useFilter, archive },
              "SABnzbd: history response missing slots"
            );
            if (useFilter) continue;
            break;
          }

          const item = history.slots.find((slot) => slot.nzo_id === id);
          downloadersLogger.debug(
            { id, useFilter, archive, slotCount: history.slots.length, found: !!item },
            "SABnzbd: history result"
          );

          if (item) return item;
          // If we used the nzo_ids filter and got no results, the filter may not be
          // supported — retry with a full scan of this same archive bucket.
          if (useFilter) continue;
          break;
        } catch (error) {
          lastError = error;
          downloadersLogger.error(
            { error, id, useFilter, archive },
            "Failed to get SABnzbd history"
          );
          if (useFilter) continue;
          break;
        }
      }
    }

    if (!sawCleanResponse && options?.throwOnError && lastError) {
      throw lastError;
    }
    return null;
  }

  private async getFromHistory(
    id: string,
    options?: { throwOnError?: boolean }
  ): Promise<DownloadStatus | null> {
    const item = await this.fetchHistorySlot(id, options);
    if (!item) return null;

    let status: DownloadStatus["status"];
    let repairStatus: DownloadStatus["repairStatus"];
    let unpackStatus: DownloadStatus["unpackStatus"];

    if (item.status === "Completed") {
      status = "completed";
      repairStatus = "good";
      unpackStatus = "completed";
    } else if (item.status === "Failed") {
      status = "error";
      repairStatus = "failed";
    } else {
      status = "paused";
    }

    return {
      id: item.nzo_id,
      name: item.name,
      downloadType: "usenet",
      status,
      progress: status === "completed" ? 100 : 0,
      size: item.bytes,
      downloaded: item.bytes,
      category: item.category,
      error: status === "error" ? item.fail_message : undefined,
      repairStatus,
      unpackStatus,
    };
  }

  private async getHistoryDownloadDir(id: string): Promise<string | undefined> {
    const item = await this.fetchHistorySlot(id);
    if (!item) return undefined;
    return this.resolveHistoryDownloadDir(item);
  }

  private resolveHistoryDownloadDir(item: SABnzbdHistory["slots"][number]): string | undefined {
    const completedPath = item.path
      ? stripTrailingPathSeparators(
          item.path
            .replaceAll("/incomplete/", "/complete/")
            .replaceAll("\\incomplete\\", "\\complete\\")
        )
      : undefined;
    // `storage` is SABnzbd's final resting place for the completed job
    if (item.storage) {
      const normalizedStorage = stripTrailingPathSeparators(item.storage);
      if (completedPath) {
        const normalizedStoragePosix = normalizedStorage.replaceAll("\\", "/");
        const completedPathPosix = completedPath.replaceAll("\\", "/");
        if (
          normalizedStoragePosix === completedPathPosix ||
          normalizedStoragePosix.startsWith(`${completedPathPosix}/`)
        ) {
          return completedPath;
        }
      }

      return normalizedStorage;
    }
    // Fallback for older SABnzbd versions that don't expose `storage`.
    return completedPath;
  }

  async getDownloadDetails(id: string): Promise<DownloadDetails | null> {
    const status = await this.getDownloadStatus(id);
    if (!status) return null;

    const downloadDir =
      status.status === "completed" ? await this.getHistoryDownloadDir(id) : undefined;

    return {
      ...status,
      downloadDir,
      files: [],
      filesSupport: "unsupported",
      filesSupportReason: "SABnzbd API does not expose per-file details for queue/history items.",
      trackers: [],
    };
  }

  async getAllDownloads(options?: { throwOnError?: boolean }): Promise<DownloadStatus[]> {
    try {
      const url = this.getApiUrl("queue");
      const response = await this.fetchWithFallback(url);
      const data = await response.json();
      const queue: SABnzbdQueue = data.queue;

      const results: DownloadStatus[] = [];

      for (const item of queue.slots) {
        const status = await this.getDownloadStatus(item.nzo_id, options);
        if (status) {
          results.push(status);
        }
      }

      return results;
    } catch (error) {
      downloadersLogger.error({ error }, "Failed to get SABnzbd queue");
      if (options?.throwOnError) throw error;
      return [];
    }
  }

  async pauseDownload(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const url = this.getApiUrl("pause", { value: id });
      const response = await this.fetchWithFallback(url);
      const data = await response.json();

      if (data.status === true) {
        return { success: true, message: "NZB paused" };
      }

      return { success: false, message: "Failed to pause NZB" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async resumeDownload(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const url = this.getApiUrl("resume", { value: id });
      const response = await this.fetchWithFallback(url);
      const data = await response.json();

      if (data.status === true) {
        return { success: true, message: "NZB resumed" };
      }

      return { success: false, message: "Failed to resume NZB" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async removeDownload(
    id: string,
    _deleteFiles?: boolean
  ): Promise<{ success: boolean; message: string }> {
    try {
      const url = this.getApiUrl("queue", { name: "delete", value: id });
      const response = await this.fetchWithFallback(url);
      const data = await response.json();

      if (data.status === true) {
        return { success: true, message: "NZB removed" };
      }

      return { success: false, message: "Failed to remove NZB" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getFreeSpace(): Promise<number> {
    try {
      const url = this.getApiUrl("queue");
      const response = await this.fetchWithFallback(url);
      const data = await response.json();

      // diskspace1 is free disk space in GB (float)
      const gb = parseFloat(data.queue?.diskspace1);
      if (!isNaN(gb)) {
        return gb * 1024 * 1024 * 1024;
      }

      return 0;
    } catch (error) {
      downloadersLogger.error({ error }, "Failed to get SABnzbd free space");
      return 0;
    }
  }

  async findTorrentByTag(tag: string): Promise<string | null> {
    return findTorrentByTagNull(tag);
  }
}
