import { describe, expect, it } from "vitest";
import {
  formatInterfaceMessage,
  translateInterfaceLabel,
  type InterfaceLanguage,
} from "../interface-locale";

const LOCALES: InterfaceLanguage[] = [
  "es",
  "zh-Hans",
  "hi",
  "de",
  "ja",
  "fr",
  "pt-BR",
  "ar",
  "ko",
  "zh-Hant",
  "vi",
  "id",
];

const SERVER_RESPONSE_MESSAGES = [
  "SSL settings updated. Restart required.",
  "Certificate generated",
  "Certificate uploaded successfully",
  "Synced indexers from Prowlarr: {added} added, {updated} updated",
  "Metadata refresh complete: {updated} updated, {failed} failed.",
];

describe("localized server success messages", () => {
  it("has a direct translation in each supported locale", () => {
    for (const source of SERVER_RESPONSE_MESSAGES) {
      for (const locale of LOCALES) {
        expect(translateInterfaceLabel(source, locale), `${locale}: ${source}`).not.toBe(source);
      }
    }
  });

  it("formats server-provided counts without translating the values", () => {
    const source = "Synced indexers from Prowlarr: {added} added, {updated} updated";

    for (const locale of LOCALES) {
      const text = formatInterfaceMessage(source, { added: 7, updated: 2 }, locale);
      expect(text, locale).toContain("7");
      expect(text, locale).toContain("2");
      expect(text, locale).not.toContain("{added}");
      expect(text, locale).not.toContain("{updated}");
    }
  });

  it("isolates count values in Arabic output", () => {
    const source = "Metadata refresh complete: {updated} updated, {failed} failed.";
    const text = formatInterfaceMessage(source, { updated: 7, failed: 2 }, "ar");

    expect(text).toContain("\u20687\u2069");
    expect(text).toContain("\u20682\u2069");
  });
});
