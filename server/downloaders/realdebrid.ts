import { serviceMessage } from "../../shared/service-messages.js";
import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { Downloader, DownloadDetails, DownloadStatus } from "../../shared/schema.js";
import { storage } from "../storage.js";
import { downloadersLogger } from "../logger.js";
import { safeFetch } from "../ssrf.js";
import { fetchWithMagnetDetection } from "./utils.js";
import type {
  DownloadRequest,
  DownloaderActionResult,
  DownloadResult,
  DownloaderClient,
} from "./types.js";
import { getRealDebridAccessToken } from "./realdebrid-auth.js";

export const REAL_DEBRID_API_URL = "https://api.real-debrid.com/rest/1.0";

interface RealDebridFile {
  id: number;
  path: string;
  bytes: number;
  selected: number;
}

interface RealDebridTorrent {
  id: string;
  filename?: string;
  original_filename?: string;
  hash?: string;
  bytes?: number;
  original_bytes?: number;
  progress?: number;
  status: string;
  speed?: number;
  seeders?: number;
  files?: RealDebridFile[];
  links?: string[];
}

interface RealDebridTorrentListItem {
  id: string;
  filename?: string;
  original_filename?: string;
  hash?: string;
  bytes?: number;
  progress?: number;
  status: string;
  speed?: number;
  seeders?: number;
}

interface RealDebridUnrestrictedLink {
  download: string;
  filename?: string;
  filesize?: number;
}

interface StagedFile {
  name: string;
  size: number;
  path: string;
}

interface StagingTask {
  state: "copying" | "completed" | "failed";
  torrent: RealDebridTorrent;
  folderName: string;
  stagingDirectory: string;
  rootDirectory: string;
  files: StagedFile[];
  downloaded: number;
  total: number;
  speed: number;
  startedAt: number;
  lastSampleAt: number;
  lastSampleBytes: number;
  error?: string;
  controller: AbortController;
}

const stagingTasks = new Map<string, StagingTask>();
const recentTorrentCache = new Map<
  string,
  { torrent: RealDebridTorrentListItem | RealDebridTorrent; fetchedAt: number }
>();
const TORRENT_STATUS_CACHE_MS = 90 * 1000;
const MAX_STAGING_FILES = 100;
const TERMINAL_ERRORS = new Map<string, string>([
  ["magnet_error", "Real-Debrid could not read this magnet link."],
  ["error", "Real-Debrid could not complete this torrent."],
  ["virus", "Real-Debrid blocked this torrent as unsafe."],
  ["dead", "Real-Debrid marked this torrent as unavailable."],
]);

const taskKey = (downloaderId: string, torrentId: string) => `${downloaderId}:${torrentId}`;

const isContained = (candidate: string, root: string) =>
  candidate === root || candidate.startsWith(`${root}${path.sep}`);

const safePathSegment = (value: string, fallback = "file") => {
  const cleaned = Array.from(value.normalize("NFC"), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /[\\/:*?"<>|]/.test(character) || codePoint < 0x20 || codePoint === 0x7f
      ? "_"
      : character;
  })
    .join("")
    .replace(/\.{2,}/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return cleaned || fallback;
};

const getStagingFolderName = (torrent: RealDebridTorrent) =>
  `${safePathSegment(torrent.original_filename || torrent.filename || `game-${torrent.id}`, "game")}-${safePathSegment(torrent.id)}`;

const torrentStatus = (value: string): DownloadStatus["status"] =>
  TERMINAL_ERRORS.has(value)
    ? "error"
    : value === "downloaded"
      ? "downloading"
      : value === "queued"
        ? "paused"
        : "downloading";

export class RealDebridClient implements DownloaderClient {
  private readonly downloader: Downloader;

  constructor(downloader: Downloader) {
    this.downloader = downloader;
  }

  private async request<T>(
    endpoint: string,
    options: { method?: string; form?: URLSearchParams; timeoutMs?: number } = {}
  ): Promise<T> {
    const token = await getRealDebridAccessToken(this.downloader);
    const response = await safeFetch(`${REAL_DEBRID_API_URL}${endpoint}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(options.form ? { body: options.form.toString() } : {}),
      timeoutMs: options.timeoutMs ?? 15000,
      requireHttps: true,
    });
    if (!response.ok) {
      let reason = "Real-Debrid request failed.";
      try {
        const payload = (await response.json()) as { error?: unknown; error_code?: unknown };
        if (typeof payload.error === "string" && payload.error.length < 160) {
          reason = `Real-Debrid: ${payload.error}`;
        }
      } catch {
        // Keep the generic message for non-JSON API errors.
      }
      throw new Error(reason);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async getTorrent(id: string): Promise<RealDebridTorrent | null> {
    try {
      return await this.request<RealDebridTorrent>(`/torrents/info/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof Error && /not found|unknown ressource/i.test(error.message)) {
        return null;
      }
      throw error;
    }
  }

  async testConnection(): Promise<DownloaderActionResult> {
    if (!this.downloader.downloadPath || !path.isAbsolute(this.downloader.downloadPath)) {
      return {
        success: false,
        message: "Set an absolute local staging path that QuestarrNG can write to.",
      };
    }
    try {
      const user = await this.request<{ username?: string; type?: string }>("/user");
      return {
        success: true,
        ...(user.username
          ? serviceMessage("service.realdebrid_connected_user", {
              username: user.username,
              path: String(this.downloader.downloadPath),
            })
          : serviceMessage("service.realdebrid_connected", {
              path: String(this.downloader.downloadPath),
            })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not connect to Real-Debrid.",
      };
    }
  }

  async logVersionInfo(): Promise<void> {
    try {
      const user = await this.request<{ username?: string; type?: string }>("/user");
      downloadersLogger.info(
        { downloaderId: this.downloader.id, accountType: user.type },
        "Connected to Real-Debrid"
      );
    } catch (error) {
      downloadersLogger.warn(
        { downloaderId: this.downloader.id, error },
        "Real-Debrid account probe failed"
      );
    }
  }

  async addDownload(request: DownloadRequest): Promise<DownloadResult> {
    if (!this.downloader.downloadPath || !path.isAbsolute(this.downloader.downloadPath)) {
      return {
        success: false,
        message: "Set an absolute QuestarrNG local staging path before adding downloads.",
      };
    }
    try {
      let added: { id: string };
      if (request.url.toLowerCase().startsWith("magnet:?")) {
        added = await this.request<{ id: string }>("/torrents/addMagnet", {
          method: "POST",
          form: new URLSearchParams({ magnet: request.url }),
        });
      } else {
        const fetched = await fetchWithMagnetDetection(request.url);
        if (fetched.magnetLink) {
          added = await this.request<{ id: string }>("/torrents/addMagnet", {
            method: "POST",
            form: new URLSearchParams({ magnet: fetched.magnetLink }),
          });
        } else if (fetched.response?.ok && fetched.response.body) {
          added = await this.addTorrentFile(fetched.response);
        } else {
          return {
            success: false,
            message: "The indexer result was not a usable magnet link or torrent file.",
          };
        }
      }
      if (!added?.id) throw new Error("Real-Debrid did not return a torrent ID.");
      const info = await this.getTorrent(added.id).catch(() => null);
      if (info?.status === "waiting_files_selection") {
        await this.selectAllFiles(added.id);
      }
      return { success: true, id: added.id, message: "Torrent sent to Real-Debrid." };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Could not add this magnet to Real-Debrid.",
      };
    }
  }

  private async addTorrentFile(response: Response): Promise<{ id: string }> {
    const announcedSize = Number(response.headers.get("content-length"));
    const maxTorrentFileBytes = 10 * 1024 * 1024;
    if (Number.isFinite(announcedSize) && announcedSize > maxTorrentFileBytes) {
      throw new Error("The indexer torrent file is larger than 10 MB.");
    }
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxTorrentFileBytes) {
        await reader.cancel();
        throw new Error("The indexer torrent file is larger than 10 MB.");
      }
      chunks.push(value);
    }
    const torrentBytes = new Uint8Array(totalBytes);
    let torrentOffset = 0;
    for (const chunk of chunks) {
      torrentBytes.set(chunk, torrentOffset);
      torrentOffset += chunk.byteLength;
    }
    const torrentFile = new Blob([torrentBytes.buffer], { type: "application/x-bittorrent" });
    const form = new FormData();
    form.append("file", torrentFile, "questarr-release.torrent");
    const token = await getRealDebridAccessToken(this.downloader);
    const upload = await safeFetch(`${REAL_DEBRID_API_URL}/torrents/addTorrent`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      timeoutMs: 30000,
      requireHttps: true,
    });
    if (!upload.ok) {
      throw new Error("Real-Debrid could not accept the indexer torrent file.");
    }
    return (await upload.json()) as { id: string };
  }

  private async selectAllFiles(id: string): Promise<void> {
    const form = new URLSearchParams({ files: "all" });
    await this.request<void>(`/torrents/selectFiles/${encodeURIComponent(id)}`, {
      method: "POST",
      form,
    });
  }

  private asStatus(torrent: RealDebridTorrentListItem | RealDebridTorrent): DownloadStatus {
    const key = taskKey(this.downloader.id, torrent.id);
    const task = stagingTasks.get(key);
    if (task?.state === "completed") {
      return {
        id: torrent.id,
        name: torrent.original_filename || torrent.filename || task.folderName,
        downloadType: "torrent",
        status: "completed",
        progress: 100,
        size: task.total,
        downloaded: task.total,
        downloadSpeed: 0,
        category: this.downloader.category ?? undefined,
        trackedByQuestarr: true,
      };
    }
    if (task?.state === "failed") {
      return {
        id: torrent.id,
        name: torrent.original_filename || torrent.filename || "Real-Debrid download",
        downloadType: "torrent",
        status: "error",
        progress: Number(torrent.progress) || 0,
        error: task.error || "Real-Debrid files could not be copied to QuestarrNG.",
        category: this.downloader.category ?? undefined,
        trackedByQuestarr: true,
      };
    }
    if (task?.state === "copying") {
      return {
        id: torrent.id,
        name: torrent.original_filename || torrent.filename || task.folderName,
        downloadType: "torrent",
        status: "downloading",
        progress:
          task.total > 0 ? Math.min(99, Math.floor((task.downloaded / task.total) * 100)) : 0,
        size: task.total,
        downloaded: task.downloaded,
        downloadSpeed: task.speed,
        category: this.downloader.category ?? undefined,
        trackedByQuestarr: true,
      };
    }
    return {
      id: torrent.id,
      name: torrent.original_filename || torrent.filename || `Real-Debrid torrent ${torrent.id}`,
      downloadType: "torrent",
      status: torrentStatus(torrent.status),
      // The cloud copy may finish before QuestarrNG's local staging copy.
      // Reserve completion for files that are present in the local library.
      progress:
        torrent.status === "downloaded"
          ? 99
          : Math.max(0, Math.min(100, Number(torrent.progress) || 0)),
      downloadSpeed: Number(torrent.speed) || 0,
      size: Number(torrent.bytes) || undefined,
      seeders: Number(torrent.seeders) || undefined,
      error: TERMINAL_ERRORS.get(torrent.status),
      category: this.downloader.category ?? undefined,
    };
  }

  async getDownloadStatus(
    id: string,
    _options?: { throwOnError?: boolean }
  ): Promise<DownloadStatus | null> {
    const key = taskKey(this.downloader.id, id);
    const task = stagingTasks.get(key);
    if (task) {
      return this.asStatus(task.torrent);
    }
    const cached = recentTorrentCache.get(key);
    let torrent =
      cached && Date.now() - cached.fetchedAt < TORRENT_STATUS_CACHE_MS
        ? cached.torrent
        : await this.getTorrent(id);
    if (!torrent) return null;
    if (torrent.status === "waiting_files_selection") {
      await this.selectAllFiles(id);
      torrent = { ...torrent, status: "downloading", progress: 0 };
      recentTorrentCache.set(key, { torrent, fetchedAt: Date.now() });
      return this.asStatus(torrent);
    }
    if (torrent.status === "downloaded") {
      // The list endpoint omits selected file paths and links, so fetch the
      // detail endpoint once when cloud acquisition finishes. StagingTask then
      // keeps this snapshot while the potentially long local copy runs.
      if (
        !Array.isArray((torrent as RealDebridTorrent).files) ||
        !Array.isArray((torrent as RealDebridTorrent).links)
      ) {
        torrent = (await this.getTorrent(id)) ?? torrent;
      }
      const detailedTorrent = torrent as RealDebridTorrent;
      if (Array.isArray(detailedTorrent.files) && Array.isArray(detailedTorrent.links)) {
        this.startStaging(detailedTorrent);
      } else {
        return this.asStatus({
          ...torrent,
          status: "downloading",
          progress: Math.min(99, Number(torrent.progress) || 0),
        });
      }
      return this.asStatus(torrent);
    }
    return this.asStatus(torrent);
  }

  async getDownloadDetails(id: string): Promise<DownloadDetails | null> {
    const task = stagingTasks.get(taskKey(this.downloader.id, id));
    if (!task || task.state !== "completed") return null;
    const oneFile = task.files.length === 1;
    const details: DownloadDetails = {
      id,
      name: oneFile ? task.files[0]!.name : task.folderName,
      downloadType: "torrent",
      status: "completed",
      progress: 100,
      size: task.total,
      downloaded: task.total,
      downloadSpeed: 0,
      category: this.downloader.category ?? undefined,
      trackedByQuestarr: true,
      downloadDir: oneFile ? task.stagingDirectory : task.rootDirectory,
      files: task.files.map((file) => ({
        name: file.name,
        size: file.size,
        progress: 100,
        priority: "normal",
        wanted: true,
      })),
      filesSupport: "supported",
      trackers: [],
    };
    return details;
  }

  async getAllDownloads(): Promise<DownloadStatus[]> {
    const torrents = await this.request<RealDebridTorrentListItem[]>("/torrents?limit=5000");
    const trackedIds = new Set(
      (await storage.getDownloadingGameDownloads())
        .filter((download) => download.downloaderId === this.downloader.id)
        .map((download) => download.downloadHash.toLowerCase())
    );
    return (Array.isArray(torrents) ? torrents : [])
      .filter((torrent) => trackedIds.has(torrent.id.toLowerCase()))
      .map((torrent) => {
        recentTorrentCache.set(taskKey(this.downloader.id, torrent.id), {
          torrent,
          fetchedAt: Date.now(),
        });
        return this.asStatus(torrent);
      });
  }

  async pauseDownload(_id: string): Promise<DownloaderActionResult> {
    return {
      success: false,
      message: "Real-Debrid does not support pausing torrents through its API.",
    };
  }

  async resumeDownload(_id: string): Promise<DownloaderActionResult> {
    return {
      success: false,
      message: "Real-Debrid starts torrents automatically and does not expose a resume action.",
    };
  }

  async removeDownload(id: string, deleteFiles = false): Promise<DownloaderActionResult> {
    const key = taskKey(this.downloader.id, id);
    const task = stagingTasks.get(key);
    task?.controller.abort();
    let stagingDirectory = task?.stagingDirectory;
    if (deleteFiles && !stagingDirectory && this.downloader.downloadPath) {
      const torrent = await this.getTorrent(id).catch(() => null);
      if (torrent) {
        stagingDirectory = path.resolve(
          this.downloader.downloadPath,
          getStagingFolderName(torrent)
        );
      }
    }
    let remoteRemoved = false;
    try {
      await this.request<void>(`/torrents/delete/${encodeURIComponent(id)}`, { method: "DELETE" });
      remoteRemoved = true;
      if (deleteFiles && stagingDirectory && this.downloader.downloadPath) {
        const stageInfo = await fs.lstat(stagingDirectory).catch(() => null);
        if (stageInfo?.isSymbolicLink()) {
          throw new Error(
            "The QuestarrNG staging directory is a symbolic link and was not removed."
          );
        }
        if (stageInfo) {
          const rootDirectory = path.resolve(this.downloader.downloadPath);
          if (path.dirname(stagingDirectory) !== rootDirectory) {
            throw new Error("The QuestarrNG staging directory is outside the configured path.");
          }
          const rootRealPath = await fs.realpath(rootDirectory);
          const stagingRealPath = await fs.realpath(stagingDirectory);
          if (!isContained(stagingRealPath, rootRealPath)) {
            throw new Error("The QuestarrNG staging directory is outside the configured path.");
          }
          await fs.rm(stagingRealPath, { recursive: true, force: true });
        }
      }
      stagingTasks.delete(key);
      recentTorrentCache.delete(key);
      return {
        success: true,
        message:
          deleteFiles && stagingDirectory
            ? "Real-Debrid torrent and QuestarrNG staged files removed."
            : "Real-Debrid torrent removed. QuestarrNG staged files were kept.",
      };
    } catch (error) {
      if (task) {
        task.state = "failed";
        task.error = remoteRemoved
          ? "The torrent was removed but its local staging directory needs cleanup."
          : "The local copy stopped when torrent removal was requested.";
      }
      return {
        success: false,
        message: remoteRemoved
          ? error instanceof Error
            ? `The Real-Debrid torrent was removed, but its staged files could not be removed: ${error.message}`
            : "The Real-Debrid torrent was removed, but its staged files could not be removed."
          : error instanceof Error
            ? error.message
            : "Could not remove the Real-Debrid torrent.",
      };
    }
  }

  async getFreeSpace(): Promise<number> {
    if (!this.downloader.downloadPath) return 0;
    try {
      const stats = await fs.statfs(this.downloader.downloadPath);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return 0;
    }
  }

  async findTorrentByTag(_tag: string): Promise<string | null> {
    return null;
  }

  private startStaging(torrent: RealDebridTorrent): void {
    const key = taskKey(this.downloader.id, torrent.id);
    const existing = stagingTasks.get(key);
    if (existing && existing.state !== "failed") return;

    const folderName = getStagingFolderName(torrent);
    const stagingDirectory = path.resolve(this.downloader.downloadPath!, folderName);
    const task: StagingTask = {
      state: "copying",
      torrent,
      folderName,
      stagingDirectory,
      rootDirectory: path.resolve(this.downloader.downloadPath!),
      files: [],
      downloaded: 0,
      total: Math.max(0, Number(torrent.bytes) || 0),
      speed: 0,
      startedAt: Date.now(),
      lastSampleAt: Date.now(),
      lastSampleBytes: 0,
      controller: new AbortController(),
    };
    stagingTasks.set(key, task);
    void this.stageTorrent(torrent, task).catch((error: unknown) => {
      if (task.controller.signal.aborted) return;
      task.state = "failed";
      task.error = error instanceof Error ? error.message : "Real-Debrid staging failed.";
      downloadersLogger.error(
        { downloaderId: this.downloader.id, torrentId: torrent.id, error },
        "Could not copy Real-Debrid torrent into the local import staging area"
      );
    });
  }

  private async stageTorrent(torrent: RealDebridTorrent, task: StagingTask): Promise<void> {
    const files = (torrent.files ?? []).filter((file) => file.selected === 1);
    const links = torrent.links ?? [];
    if (files.length === 0 || links.length !== files.length) {
      throw new Error("Real-Debrid did not provide selected files and matching download links.");
    }
    if (files.length > MAX_STAGING_FILES) {
      throw new Error(`This torrent has more than ${MAX_STAGING_FILES} selected files.`);
    }

    await fs.mkdir(task.rootDirectory, { recursive: true });
    const rootRealPath = await fs.realpath(task.rootDirectory);
    await fs.mkdir(task.stagingDirectory, { recursive: true });
    const stagingInfo = await fs.lstat(task.stagingDirectory);
    if (stagingInfo.isSymbolicLink() || !stagingInfo.isDirectory()) {
      throw new Error("The Real-Debrid staging directory is not a safe local directory.");
    }
    const stagingRealPath = await fs.realpath(task.stagingDirectory);
    if (!isContained(stagingRealPath, rootRealPath)) {
      throw new Error("The Real-Debrid staging directory escaped its configured local path.");
    }

    task.total = files.reduce((sum, file) => sum + Math.max(0, Number(file.bytes) || 0), 0);
    task.files = [];
    task.downloaded = 0;
    for (let index = 0; index < files.length; index++) {
      const file = files[index]!;
      const link = links[index];
      if (!link) throw new Error("Real-Debrid returned an incomplete file link list.");
      const relativeName = this.safeTorrentRelativePath(file.path);
      const destination = path.resolve(stagingRealPath, relativeName);
      if (!isContained(destination, stagingRealPath)) {
        throw new Error("A Real-Debrid file path escaped the staging directory.");
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const parentRealPath = await fs.realpath(path.dirname(destination));
      if (!isContained(parentRealPath, stagingRealPath)) {
        throw new Error("A torrent directory escaped the QuestarrNG staging directory.");
      }
      const unrestricted = await this.request<RealDebridUnrestrictedLink>("/unrestrict/link", {
        method: "POST",
        form: new URLSearchParams({ link }),
      });
      const size = Math.max(0, Number(file.bytes) || Number(unrestricted.filesize) || 0);
      await this.copyFile(unrestricted.download, destination, size, task);
      const stat = await fs.stat(destination);
      if (!stat.isFile() || (size > 0 && stat.size !== size)) {
        throw new Error(`The copied file ${path.basename(destination)} has an unexpected size.`);
      }
      task.files.push({ name: relativeName, size: stat.size, path: destination });
    }
    task.downloaded = task.total || task.downloaded;
    task.state = "completed";
    task.speed = 0;
  }

  private safeTorrentRelativePath(rawPath: string): string {
    const normalized = path.posix.normalize(rawPath.normalize("NFC").replace(/\\/g, "/"));
    const relative = normalized.replace(/^\/+/, "");
    const segments = relative.split("/");
    if (!relative || segments.some((segment) => !segment || segment === ".." || segment === ".")) {
      throw new Error("Real-Debrid returned an unsafe torrent file path.");
    }
    return segments.map((segment) => safePathSegment(segment)).join(path.sep);
  }

  private async copyFile(
    rawUrl: string,
    destination: string,
    expectedSize: number,
    task: StagingTask
  ): Promise<void> {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") throw new Error("Real-Debrid returned a non-HTTPS file URL.");
    const finalStat = await fs.lstat(destination).catch(() => null);
    if (finalStat?.isSymbolicLink()) throw new Error("A staged file path is a symbolic link.");
    if (finalStat && !finalStat.isFile())
      throw new Error("A staged file path is not a regular file.");
    if (finalStat?.isFile() && expectedSize > 0 && finalStat.size === expectedSize) {
      task.downloaded += finalStat.size;
      return;
    }

    const partialPath = `${destination}.part`;
    const partialStat = await fs.lstat(partialPath).catch(() => null);
    if (partialStat?.isSymbolicLink()) throw new Error("A partial staged file is a symbolic link.");
    let offset = partialStat?.isFile() ? partialStat.size : 0;
    if (expectedSize > 0 && offset >= expectedSize) {
      await fs.rm(partialPath, { force: true });
      offset = 0;
    }
    const response = await safeFetch(url.toString(), {
      ...(offset > 0 ? { headers: { range: `bytes=${offset}-` } } : {}),
      timeoutMs: 0,
      maxRedirects: 5,
      requireHttps: true,
      signal: task.controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error("Real-Debrid could not stream a completed file into QuestarrNG.");
    }
    const append = offset > 0 && response.status === 206;
    if (!append) {
      offset = 0;
      await fs.rm(partialPath, { force: true });
    }
    const openFlags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW;
    const handle = await fs.open(
      partialPath,
      openFlags | (append ? fsConstants.O_APPEND : fsConstants.O_TRUNC),
      0o600
    );
    const start = Date.now();
    const before = task.downloaded;
    const bodyReader = response.body.getReader();
    const reader = Readable.from(
      (async function* () {
        try {
          while (true) {
            const { done, value } = await bodyReader.read();
            if (done) return;
            if (value) yield Buffer.from(value);
          }
        } finally {
          bodyReader.releaseLock();
        }
      })()
    );
    reader.on("data", (chunk: Buffer) => {
      task.downloaded = before + offset + chunk.length;
      const elapsed = Math.max(1, Date.now() - start);
      task.speed = Math.round(((task.downloaded - before) * 1000) / elapsed);
      task.lastSampleAt = Date.now();
      task.lastSampleBytes = task.downloaded;
    });
    try {
      await pipeline(reader, createWriteStream(partialPath, { fd: handle.fd, autoClose: false }));
    } finally {
      await handle.close().catch(() => undefined);
    }
    const partialAfter = await fs.stat(partialPath);
    if (expectedSize > 0 && partialAfter.size !== expectedSize) {
      throw new Error(`Real-Debrid copied ${partialAfter.size} of ${expectedSize} bytes.`);
    }
    await fs.rename(partialPath, destination);
    task.downloaded = before + partialAfter.size;
  }
}
