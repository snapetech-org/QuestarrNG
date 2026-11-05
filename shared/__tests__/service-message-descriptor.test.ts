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
  serviceErrorBody,
  serviceErrorResult,
  serviceMessage,
  serviceMessageValue,
  serviceMessageError,
} from "../service-messages.js";

describe("typed service message descriptors", () => {
  it("fails closed when a typed error's text or a producer fragment no longer matches its source", () => {
    const error = new ServiceMessageError("service.no_enabled_indexers", {});
    error.message = "Provider diagnostic: Download paused successfully";
    expect(serviceErrorMetadata(error)).toEqual({});
    expect(serviceErrorValue(error)).toBe(error.message);
    const fragment = serviceMessage("service.no_enabled_indexers", {});
    const cause = new Error("provider cause");
    const raw = serviceMessageError({ ...fragment, message: error.message }, { cause });
    expect(raw).not.toBeInstanceOf(ServiceMessageError);
    expect(raw.message).toBe(error.message);
    expect(raw.cause).toBe(cause);
  });
  it("retains explicit matching search metadata without promoting lookalike values", () => {
    const fragment = serviceMessage("service.indexer_disabled", {
      indexer: "Name العربية: {error}",
    });
    expect(serviceMessageValue(fragment.message, fragment)).toEqual(fragment);
    expect(serviceMessageValue(fragment.message, null)).toBe(fragment.message);
    expect(
      serviceMessageValue(fragment.message, {
        ...fragment,
        messageValues: { indexer: "different" },
      })
    ).toBe(fragment.message);
    const cause = new Error("provider cause");
    const error = serviceMessageError(fragment, { cause });
    expect(error).toBeInstanceOf(ServiceMessageError);
    expect(error.cause).toBe(cause);
    expect(serviceErrorValue(error)).toEqual(fragment);
  });

  it("retains exact English for parameterized source fallback templates in RTL locales", () => {
    const provider = "Provider العربية: /stage/{error} – 404";
    const fragment = serviceMessage("service.nzb_sabnzbd_add_failed", { error: provider });
    const stored = serializeServiceMessageDescriptor(fragment);
    expect(fragment.message).toBe(`Failed to add NZB to SABnzbd: ${provider}`);
    expect(localizeServiceMessage(fragment.message, stored, "ar")).toBe(fragment.message);
    expect(localizeServiceMessage(fragment.message, stored, "fr")).toBe(fragment.message);
    expect(fragment.messageDetails).toBeUndefined();
  });
  it("preserves typed versus provider ownership in result and HTTP error bodies", () => {
    const typed = new ServiceMessageError("service.realdebrid_authorization_code_expired", {});
    const fallback = serviceMessage("service.realdebrid_authorization_failed", {});
    expect(serviceErrorResult(typed, fallback)).toMatchObject({
      success: false,
      message: typed.message,
      messageKey: typed.messageKey,
    });
    const tagged = serviceErrorBody(typed, fallback);
    expect(parseServiceMessageDescriptor(tagged.errorI18n)?.messageKey).toBe(typed.messageKey);
    expect(serviceErrorBody(new Error(typed.message), fallback)).toEqual({
      error: typed.message,
      errorI18n: null,
    });
    expect(serviceErrorBody({ messageKey: typed.messageKey }, fallback).error).toBe(
      fallback.message
    );
    expect(serviceErrorBody(undefined, fallback).errorI18n).not.toBeNull();
  });
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
