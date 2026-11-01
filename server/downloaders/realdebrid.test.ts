import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Downloader } from "../../shared/schema.js";
import {
  ServiceMessageError,
  serviceMessage,
  serializeServiceMessageDescriptor,
} from "../../shared/service-messages.js";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  getDownloadingGameDownloads: vi.fn(),
  getRealDebridAccessToken: vi.fn(),
  fetchWithMagnetDetection: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../ssrf.js", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("../storage.js", () => ({
  storage: { getDownloadingGameDownloads: mocks.getDownloadingGameDownloads },
}));
vi.mock("../logger.js", () => ({ downloadersLogger: mocks.logger }));
vi.mock("./utils.js", () => ({ fetchWithMagnetDetection: mocks.fetchWithMagnetDetection }));
vi.mock("./realdebrid-auth.js", () => ({
  getRealDebridAccessToken: mocks.getRealDebridAccessToken,
}));

import { RealDebridClient } from "./realdebrid.js";

describe("RealDebridClient", () => {
  let root: string;

  const makeDownloader = () =>
    ({
      id: "realdebrid-test",
      type: "realdebrid",
      name: "Real-Debrid",
      enabled: true,
      downloadPath: path.join(root, "staging"),
      category: "games",
    }) as unknown as Downloader;

  beforeEach(async () => {
    vi.resetAllMocks();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "questarr-realdebrid-test-"));
    mocks.getRealDebridAccessToken.mockResolvedValue("test-access-token");
    mocks.getDownloadingGameDownloads.mockResolvedValue([]);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("requires an absolute local staging path before connecting or adding downloads", async () => {
    const downloader = { ...makeDownloader(), downloadPath: "relative/path" } as Downloader;
    const client = new RealDebridClient(downloader);

    await expect(client.testConnection()).resolves.toMatchObject({ success: false });
    await expect(
      client.addDownload({ url: "magnet:?xt=urn:btih:abc", title: "Game" })
    ).resolves.toMatchObject({ success: false });
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "retains authentication error ownership through client results: %s",
    async (typed) => {
      const appError = new ServiceMessageError("service.realdebrid_authorization_expired", {});
      mocks.getRealDebridAccessToken.mockRejectedValue(
        typed ? appError : new Error(appError.message)
      );
      const client = new RealDebridClient(makeDownloader());
      for (const result of [
        await client.testConnection(),
        await client.addDownload({ url: "magnet:?xt=urn:btih:abc", title: "Game" }),
      ]) {
        expect(result).toMatchObject({ success: false, message: appError.message });
        if (typed) expect(result).toHaveProperty("messageKey", appError.messageKey);
        else expect(result).not.toHaveProperty("messageKey");
      }
      expect(mocks.safeFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["pauseDownload", "service.realdebrid_pause_unsupported"],
    ["resumeDownload", "service.realdebrid_resume_unsupported"],
  ] as const)("tags fixed %s limitations without sending a request", async (method, key) => {
    const result = await new RealDebridClient(makeDownloader())[method]("torrent:العربية");
    expect(result).toEqual({ success: false, ...serviceMessage(key, {}) });
    expect(serializeServiceMessageDescriptor(result)).not.toBeNull();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "distinguishes provider payloads from the fixed request fallback: %s",
    async (provider) => {
      const text = "Real-Debrid request failed.";
      mocks.safeFetch.mockResolvedValueOnce(
        new Response(provider ? JSON.stringify({ error: text }) : "<html>offline</html>", {
          status: 503,
        })
      );
      const result = await new RealDebridClient(makeDownloader()).testConnection();
      expect(result).toMatchObject(
        provider
          ? {
              success: false,
              ...serviceMessage("service.realdebrid_provider_error", { error: text }),
            }
          : { success: false, ...serviceMessage("service.realdebrid_request_failed", {}) }
      );
      expect(result).not.toHaveProperty("messageDetails");
    }
  );

  it.each([true, false])("preserves typed versus provider removal errors: %s", async (typed) => {
    const error = new ServiceMessageError("service.realdebrid_authorization_expired", {});
    mocks.getRealDebridAccessToken.mockRejectedValueOnce(typed ? error : new Error(error.message));
    const result = await new RealDebridClient(makeDownloader()).removeDownload("not-started");
    expect(result).toMatchObject({ success: false, message: error.message });
    expect(serializeServiceMessageDescriptor(result) !== null).toBe(typed);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("selects all files when a newly added torrent is waiting for file selection", async () => {
    const client = new RealDebridClient(makeDownloader());
    mocks.safeFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "torrent-1" }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "torrent-1", status: "waiting_files_selection" }))
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await client.addDownload({
      url: "magnet:?xt=urn:btih:abc",
      title: "Example Game",
    });

    expect(result).toMatchObject({ success: true, id: "torrent-1" });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    expect(String(mocks.safeFetch.mock.calls[2]?.[0])).toContain("/torrents/selectFiles/torrent-1");
    expect(mocks.safeFetch.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: "files=all",
    });
  });

  it("lists only torrents tracked by QuestarrNG", async () => {
    const downloader = makeDownloader();
    const client = new RealDebridClient(downloader);
    mocks.getDownloadingGameDownloads.mockResolvedValue([
      { downloaderId: downloader.id, downloadHash: "tracked-torrent" },
    ]);
    mocks.safeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: "tracked-torrent", status: "downloading", progress: 35 },
          { id: "untracked-torrent", status: "downloaded", progress: 100 },
        ])
      )
    );

    const downloads = await client.getAllDownloads();

    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({
      id: "tracked-torrent",
      status: "downloading",
      progress: 35,
    });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("does not report cloud completion before local staging finishes", async () => {
    const downloader = makeDownloader();
    const client = new RealDebridClient(downloader);
    mocks.getDownloadingGameDownloads.mockResolvedValue([
      { downloaderId: downloader.id, downloadHash: "staging-pending" },
    ]);
    mocks.safeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "staging-pending",
            status: "downloaded",
            progress: 100,
            bytes: 1000,
          },
        ])
      )
    );

    const downloads = await client.getAllDownloads();

    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ status: "downloading", progress: 99 });
  });

  it("stages completed files locally before reporting them ready to import", async () => {
    const downloader = makeDownloader();
    const client = new RealDebridClient(downloader);
    mocks.safeFetch.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/torrents/info/torrent-stage")) {
        return new Response(
          JSON.stringify({
            id: "torrent-stage",
            original_filename: "Example Game",
            status: "downloaded",
            progress: 100,
            bytes: 4,
            files: [{ id: 1, path: "/Example Game/game.bin", bytes: 4, selected: 1 }],
            links: ["https://real-debrid.example/hosted-file"],
          })
        );
      }
      if (url.includes("/unrestrict/link")) {
        return new Response(
          JSON.stringify({ download: "https://real-debrid.example/file", filesize: 4 })
        );
      }
      if (url === "https://real-debrid.example/file") return new Response("data");
      throw new Error(`Unexpected Real-Debrid request: ${url}`);
    });

    const initial = await client.getDownloadStatus("torrent-stage");
    expect(initial).toMatchObject({ status: "downloading", trackedByQuestarr: true });

    let status = initial;
    for (let attempt = 0; attempt < 30 && status?.status !== "completed"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      status = await client.getDownloadStatus("torrent-stage");
    }

    expect(status).toMatchObject({ status: "completed", progress: 100, downloaded: 4 });
    const details = await client.getDownloadDetails("torrent-stage");
    expect(details?.files).toEqual([
      expect.objectContaining({ name: "Example Game/game.bin", size: 4, wanted: true }),
    ]);
    expect(
      await fs.readFile(
        path.join(
          downloader.downloadPath!,
          "Example Game-torrent-stage",
          "Example Game",
          "game.bin"
        ),
        "utf8"
      )
    ).toBe("data");
  });

  it("rejects torrent paths that would escape the local staging directory", async () => {
    const downloader = makeDownloader();
    const client = new RealDebridClient(downloader);
    mocks.safeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "torrent-traversal",
          filename: "Unsafe",
          status: "downloaded",
          progress: 100,
          bytes: 4,
          files: [{ id: 1, path: "../../escape.bin", bytes: 4, selected: 1 }],
          links: ["https://real-debrid.example/hosted-file"],
        })
      )
    );

    await client.getDownloadStatus("torrent-traversal");
    let status = await client.getDownloadStatus("torrent-traversal");
    for (let attempt = 0; attempt < 30 && status?.status !== "error"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      status = await client.getDownloadStatus("torrent-traversal");
    }

    expect(status).toMatchObject({
      status: "error",
      errorI18n: { messageKey: "service.realdebrid_unsafe_torrent_file_path", messageValues: {} },
    });
    await expect(fs.access(path.join(root, "escape.bin"))).rejects.toThrow();
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });
});
