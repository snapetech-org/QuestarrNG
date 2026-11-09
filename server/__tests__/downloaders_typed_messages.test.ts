import { describe, expect, it, vi } from "vitest";
import type { Downloader, DownloadStatus } from "../../shared/schema.js";
import {
  ServiceMessageError,
  parseServiceMessageDescriptor,
  serviceMessage,
  serializeServiceMessageDescriptor,
} from "../../shared/service-messages.js";
import { DelugeClient } from "../downloaders/deluge.js";
import { QBittorrentClient } from "../downloaders/qbittorrent.js";
import { RTorrentClient } from "../downloaders/rtorrent.js";
import { TransmissionClient } from "../downloaders/transmission.js";

vi.mock("../logger.js", () => ({
  downloadersLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../ssrf.js", () => ({ isSafeUrl: vi.fn(), safeFetch: vi.fn() }));

const downloader = {
  id: "typed",
  name: "Client",
  url: "https://example.invalid",
  allowInsecureLan: false,
  settings: null,
} as Downloader;
const cases = [
  { name: "Deluge", make: () => new DelugeClient(downloader), method: "authenticate" },
  { name: "qBittorrent", make: () => new QBittorrentClient(downloader), method: "authenticate" },
  { name: "rTorrent", make: () => new RTorrentClient(downloader), method: "makeXMLRPCRequest" },
  { name: "Transmission", make: () => new TransmissionClient(downloader), method: "makeRequest" },
];

describe("torrent client message ownership", () => {
  it.each(cases)(
    "keeps typed versus provider details through $name connection results",
    async ({ make, method }) => {
      const client = make();
      const internals = client as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const spy = vi.spyOn(internals, method);
      const error = new ServiceMessageError("service.http_error", {
        status: 503,
        error: "Provider العربية: /user/{error}",
      });
      try {
        for (const typed of [true, false]) {
          spy.mockRejectedValueOnce(typed ? error : new Error(error.message));
          const result = await client.testConnection();
          expect(result.success).toBe(false);
          expect(result.message).toContain(error.message);
          const metadata = parseServiceMessageDescriptor(result);
          expect(metadata?.messageKey).toBe("service.connection_failed");
          expect(metadata?.messageValues.error).toBe(error.message);
          expect(metadata?.messageDetails?.error?.messageKey).toBe(
            typed ? error.messageKey : undefined
          );
        }
      } finally {
        spy.mockRestore();
      }
    }
  );

  it("preserves Deluge success descriptors through its asynchronous label helper", async () => {
    const client = new DelugeClient(downloader);
    const internals = client as unknown as {
      authenticate(): Promise<void>;
      ensureConnected(): Promise<void>;
      makeRequest(...args: unknown[]): Promise<unknown>;
    };
    vi.spyOn(internals, "authenticate").mockResolvedValueOnce(undefined);
    vi.spyOn(internals, "ensureConnected").mockResolvedValueOnce(undefined);
    vi.spyOn(internals, "makeRequest").mockResolvedValueOnce({ result: "abcdef" });
    const result = await client.addDownload({
      url: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
      title: "Game",
    });
    expect(result).toEqual({
      success: true,
      id: "abcdef",
      ...serviceMessage("service.download_added", {}),
    });
    expect(serializeServiceMessageDescriptor(result)).not.toBeNull();
  });

  it("tags only qBittorrent's app fallback, preserving a matching provider diagnostic", () => {
    const client = new QBittorrentClient(downloader) as unknown as {
      mapQBittorrentStatus(torrent: Record<string, unknown>): DownloadStatus;
    };
    const torrent = {
      hash: "id",
      name: "Game",
      state: "error",
      progress: 0,
      size: 0,
      downloaded: 0,
      ratio: 0,
      num_seeds: 0,
      num_leechs: 0,
    };
    const app = client.mapQBittorrentStatus(torrent);
    expect(app.error).toBe("Torrent error");
    expect(app.errorI18n?.messageKey).toBe("service.torrent_error");
    const provider = client.mapQBittorrentStatus({ ...torrent, error_string: "Torrent error" });
    expect(provider.error).toBe(app.error);
    expect(provider.errorI18n).toBeUndefined();
  });

  it("retains error causes without confusing cause text with explicit nested app metadata", () => {
    const cause = new Error("Provider العربية: {error}");
    const error = new ServiceMessageError(
      "service.rtorrent_digest_auth_error",
      { error: cause.message },
      { cause }
    );
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(`Digest Auth Error: ${cause.message}`);
    expect(parseServiceMessageDescriptor(error)?.messageDetails).toBeUndefined();
  });
});
