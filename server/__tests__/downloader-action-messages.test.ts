import { afterEach, describe, expect, it, vi } from "vitest";
import { QBittorrentClient } from "../downloaders/qbittorrent.js";
import { DelugeClient } from "../downloaders/deluge.js";
import { RTorrentClient } from "../downloaders/rtorrent.js";
import { TransmissionClient } from "../downloaders/transmission.js";
import { SynologyDownloadStationClient } from "../downloaders/synology.js";
import type { Downloader } from "../../shared/schema.js";
import {
  ServiceMessageError,
  localizeServiceMessage,
  matchingServiceMessageDescriptor,
} from "../../shared/service-messages.js";

const downloader = {
  id: "action-test",
  name: "Test Client",
  type: "qbittorrent",
  url: "http://localhost:8080",
  username: "test",
  password: "test",
  settings: null,
  allowInsecureLan: true,
} as Downloader;
const clients = [
  ["qBittorrent", QBittorrentClient, "makeRequest"],
  ["Deluge", DelugeClient, "makeRequest"],
  ["rTorrent", RTorrentClient, "makeXMLRPCRequest"],
  ["Transmission", TransmissionClient, "makeRequest"],
  ["Synology", SynologyDownloadStationClient, "requestTaskApi"],
] as const;
const actions = [
  ["pauseDownload", "pause", "paused"],
  ["resumeDownload", "resume", "resumed"],
  ["removeDownload", "remove", "removed"],
] as const;
afterEach(() => vi.restoreAllMocks());

describe.each(clients)("%s source-bound action messages", (_name, Client, transport) => {
  function prepare() {
    const client = new Client(downloader);
    const methods = client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const method of ["authenticate", "ensureConnected"])
      if (typeof methods[method] === "function")
        vi.spyOn(methods, method).mockResolvedValue(undefined);
    const request = vi.spyOn(methods, transport).mockResolvedValue({});
    return { client, request };
  }
  describe.each(actions)("%s", (method, verb, past) => {
    it("retains the exact successful English result and adds a matching app key", async () => {
      const { client } = prepare();
      const result = await client[method]("hash-123");
      expect(result.success).toBe(true);
      expect(result.message).toBe(`Download ${past} successfully`);
      expect(matchingServiceMessageDescriptor(result.message, result)).toEqual({
        messageKey: `service.download_${past}`,
        messageValues: {},
      });
      expect(localizeServiceMessage(result.message, result, "de")).not.toBe(result.message);
    });

    it("localizes only the app wrapper around unchanged provider diagnostics", async () => {
      const { client, request } = prepare();
      const provider = 'Settings / مزوّد "A": C:\\Games\\one';
      request.mockRejectedValue(new Error(provider));
      const result = await client[method]("hash-123");
      expect(result.success).toBe(false);
      expect(result.message).toBe(`Failed to ${verb} download: ${provider}`);
      const descriptor = matchingServiceMessageDescriptor(result.message, result)!;
      expect(descriptor.messageKey).toBe(`service.download_${verb}_failed`);
      expect(descriptor.messageValues.error).toBe(provider);
      expect(descriptor.messageDetails).toBeUndefined();
      expect(localizeServiceMessage(result.message, result, "ar")).toContain(
        `\u2068${provider}\u2069`
      );
    });

    it("retains explicitly nested app-error provenance", async () => {
      const { client, request } = prepare();
      request.mockRejectedValue(new ServiceMessageError("service.realdebrid_staging_failed", {}));
      const result = await client[method]("hash-123");
      const descriptor = matchingServiceMessageDescriptor(result.message, result)!;
      expect(descriptor.messageDetails?.error).toEqual({
        messageKey: "service.realdebrid_staging_failed",
        messageValues: {},
      });
      const localized = localizeServiceMessage(result.message, result, "ar");
      expect(localized).not.toContain("Real-Debrid staging failed.");
      expect(localized).toContain("Real-Debrid");
    });

    it("uses the existing unknown-error fallback for non-Error exceptions", async () => {
      const { client, request } = prepare();
      request.mockRejectedValue("opaque thrown value");
      const result = await client[method]("hash-123");
      expect(result.message).toBe(`Failed to ${verb} download: Unknown error`);
      expect(
        matchingServiceMessageDescriptor(result.message, result)?.messageDetails?.error.messageKey
      ).toBe("interface.unknown_error_ce512b43");
    });
  });
});
