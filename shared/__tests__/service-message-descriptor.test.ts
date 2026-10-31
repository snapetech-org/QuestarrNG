import { describe, expect, it } from "vitest";
import {
  ServiceMessageError,
  isServiceMessageKey,
  localizeServiceMessage,
  matchingServiceMessageDescriptor,
  parseServiceMessageDescriptor,
  serializeServiceMessageDescriptor,
  serviceErrorMetadata,
  serviceErrorValue,
  serviceMessage,
} from "../service-messages.js";

describe("typed service message descriptors", () => {
  it("round-trips explicit nested errors without parsing a game's punctuation", () => {
    const game = 'Game ": provider error {error} /srv/Stage العربية';
    const error = new ServiceMessageError("service.client_reported_error", {
      client: "Synology Download Station",
    });
    const fragment = serviceMessage("service.notification_download_aborted", {
      game,
      error: serviceErrorValue(error),
    });
    const stored = serializeServiceMessageDescriptor(fragment);
    expect(parseServiceMessageDescriptor(stored)).toBeDefined();
    const translated = localizeServiceMessage(fragment.message, stored, "ar");
    expect(translated).not.toBe(fragment.message);
    expect(translated).toContain(game);
    expect(translated).toContain("Synology Download Station");
    expect(translated).not.toContain("reported an error");
    expect(localizeServiceMessage(fragment.message, stored, "en")).toBe(fragment.message);
  });
  it("never promotes an ordinary provider Error or lookalike object to app metadata", () => {
    const text = "Real-Debrid could not read this magnet link.";
    const error = new Error(text);
    expect(serviceErrorValue(error)).toBe(text);
    expect(serviceErrorMetadata(error)).toEqual({});
    expect(
      serviceErrorMetadata({
        message: text,
        messageKey: "service.realdebrid_magnet_unreadable",
        messageValues: {},
      })
    ).toEqual({});
    const fragment = serviceMessage("service.notification_download_aborted", {
      game: "Settings",
      error: serviceErrorValue(error),
    });
    expect(localizeServiceMessage(fragment.message, fragment, "de")).toContain(text);
    expect(localizeServiceMessage(fragment.message, fragment, "de")).toContain("Settings");
  });
  it.each([
    null,
    undefined,
    "bad JSON",
    "[]",
    '{"messageKey":"unknown","messageValues":{}}',
    { messageKey: "service.connected_named", messageValues: {} },
  ])("falls back on legacy/invalid metadata %s", (metadata) => {
    expect(parseServiceMessageDescriptor(metadata)).toBeUndefined();
    expect(serializeServiceMessageDescriptor(metadata)).toBeNull();
    expect(localizeServiceMessage("Provider raw", metadata, "de")).toBe("Provider raw");
  });
  it("rejects mismatched raw text and bounds recursive data", () => {
    const fragment = serviceMessage("service.connected_named", { name: "Provider" });
    expect(matchingServiceMessageDescriptor("Provider raw", fragment)).toBeUndefined();
    const cycle: {
      messageKey: string;
      messageValues: Record<string, string>;
      messageDetails: Record<string, unknown>;
    } = {
      messageKey: "service.connection_failed",
      messageValues: { client: "X", error: "raw" },
      messageDetails: {},
    };
    cycle.messageDetails.error = cycle;
    expect(parseServiceMessageDescriptor(cycle)).toBeUndefined();
    expect(
      parseServiceMessageDescriptor({
        messageKey: "service.json_catalog_valid",
        messageValues: { count: Infinity },
      })
    ).toBeUndefined();
    expect(isServiceMessageKey("__proto__")).toBe(false);
  });
});
