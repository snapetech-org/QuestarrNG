import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SERVICE_MESSAGE_SOURCES,
  serviceMessage,
  type ServiceMessageKey,
} from "@shared/service-messages";
import { INTERFACE_LANGUAGE_OPTIONS } from "@/lib/interface-locale";
import { localizeServiceResultMessage } from "@/lib/service-message-locale";

const values = {
  game: 'A Game ": Provider',
  client: "qBittorrent",
  version: "4.6.5-beta",
  name: "My Indexer العربية",
  error: "Provider: 429 /a/path",
  url: "https://host.test:6789/a?b=c",
  count: 1234,
  username: "My User",
  path: "/srv/Stage/My Game",
};

describe("source-bound service response localization", () => {
  it("binds every wire key to the canonical source and all translated catalogs", () => {
    const catalog = JSON.parse(readFileSync("localization/messages.json", "utf8"));
    for (const [key, source] of Object.entries(SERVICE_MESSAGE_SOURCES)) {
      expect(catalog.messages[key]?.source).toBe(source);
      for (const locale of INTERFACE_LANGUAGE_OPTIONS.filter((locale) => locale.value !== "en"))
        expect(catalog.messages[key]?.translations[locale.value]).toBeTruthy();
    }
  });
  it.each(INTERFACE_LANGUAGE_OPTIONS)(
    "renders every known message in $value without changing dynamic values",
    ({ value: language }) => {
      for (const key of Object.keys(SERVICE_MESSAGE_SOURCES) as ServiceMessageKey[]) {
        const result = serviceMessage(key, values);
        const localized = localizeServiceResultMessage(result, language);
        if (language === "en") expect(localized).toBe(result.message);
        else expect(localized).not.toBe(result.message);
        for (const name of [...SERVICE_MESSAGE_SOURCES[key].matchAll(/\{([a-z]+)\}/g)].map(
          (match) => match[1]!
        )) {
          if (name === "count")
            expect(localized).toContain(
              language === "en" ? "1234" : new Intl.NumberFormat(language).format(values.count)
            );
          else expect(localized).toContain(String(values[name as keyof typeof values]));
        }
        expect(localized).not.toMatch(/\{[a-z]+\}/);
      }
    }
  );
  it("keeps provider text raw unless key, values, and original source all agree", () => {
    const message = "Connected successfully to qBittorrent";
    for (const payload of [
      { message },
      { message, messageKey: "service.unknown", messageValues: { client: "qBittorrent" } },
      {
        message: "Provider-authored text",
        messageKey: "service.connected_successfully",
        messageValues: { client: "qBittorrent" },
      },
      { message, messageKey: "service.connected_successfully", messageValues: {} },
      {
        message,
        messageKey: "service.connected_successfully",
        messageValues: { client: { name: "qBittorrent" } },
      },
      { message, messageKey: "service.connected_successfully", messageValues: [] },
    ])
      expect(localizeServiceResultMessage(payload, "de")).toBe(payload.message);
  });
  it("isolates Arabic raw parameters and inherits regional translations", () => {
    const result = serviceMessage("service.connection_failed_at", values);
    const ar = localizeServiceResultMessage(result, "ar");
    expect(ar).toContain(`\u2068${values.url}\u2069`);
    expect(ar).toContain(`\u2068${values.error}\u2069`);
    expect(localizeServiceResultMessage(result, "es-419")).toBe(
      localizeServiceResultMessage(result, "es")
    );
    expect(localizeServiceResultMessage(result, "fr-CA")).toBe(
      localizeServiceResultMessage(result, "fr")
    );
  });
});
