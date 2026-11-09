import { describe, expect, it } from "vitest";

import {
  formatInterfacePluralMessage,
  formatInterfaceSelectMessage,
  getInterfaceLanguageDirection,
  resolveInterfaceLanguage,
  translateInterfaceLabel,
  translateInterfaceMessage,
} from "@/lib/interface-locale";
import {
  formatRegionalDate,
  formatRegionalPluralMessage,
  formatRegionalNumber,
  formatRegionalDistanceToNow,
  formatRegionalUnit,
  parseRegionalNumber,
} from "@/lib/regional-format";

describe("localization infrastructure", () => {
  it("selects CLDR plural categories and exact-count overrides", () => {
    const forms = {
      one: "interface.wishlist_count_game_a1c82ba1",
      two: "navigation.library",
      few: "navigation.playing",
      many: "navigation.downloads",
      other: "navigation.settings",
      exact: { "0": "navigation.search" },
    } as const;

    const oneCount = new Intl.NumberFormat("ar").format(1);
    expect(formatInterfacePluralMessage(1, forms, {}, "ar")).toBe(
      translateInterfaceMessage(forms.one, "ar").replace("{count}", `\u2068${oneCount}\u2069`)
    );
    expect(formatInterfacePluralMessage(2, forms, {}, "ar")).toBe(
      translateInterfaceMessage(forms.two, "ar")
    );
    expect(formatInterfacePluralMessage(3, forms, {}, "ar")).toBe(
      translateInterfaceMessage(forms.few, "ar")
    );
    expect(formatInterfacePluralMessage(11, forms, {}, "ar")).toBe(
      translateInterfaceMessage(forms.many, "ar")
    );
    expect(formatInterfacePluralMessage(0, forms, {}, "ar")).toBe(
      translateInterfaceMessage(forms.exact["0"], "ar")
    );
  });

  it("keeps plural grammar in the interface language and digits in the regional format", () => {
    const forms = {
      one: "interface.wishlist_count_game_a1c82ba1",
      other: "interface.wishlist_count_games_801cfb96",
    } as const;

    const regionalCount = new Intl.NumberFormat("ar").format(2);
    expect(formatRegionalPluralMessage(2, forms, {}, "es", "ar")).toBe(
      translateInterfaceLabel(forms.other, "es").replace("{count}", regionalCount)
    );
  });

  it("selects non-numeric message branches with a fallback", () => {
    expect(
      formatInterfaceSelectMessage(
        "download",
        {
          download: "interface.download_title_5de658d1",
          other: "interface.cancel_35afca3b",
        },
        { title: "Example" },
        "en"
      )
    ).toBe("Download Example");
    expect(
      formatInterfaceSelectMessage("unknown", { other: "interface.cancel_35afca3b" }, {}, "en")
    ).toBe("Cancel");
  });

  it("resolves regional language tags only to complete selectable catalogs", () => {
    expect(resolveInterfaceLanguage("es-MX")).toBe("es-419");
    expect(resolveInterfaceLanguage("es-419")).toBe("es-419");
    expect(resolveInterfaceLanguage("es-ES")).toBe("es");
    expect(resolveInterfaceLanguage("fr-CA")).toBe("fr-CA");
    expect(resolveInterfaceLanguage("fr-FR")).toBe("fr");
    expect(resolveInterfaceLanguage("pt-BR")).toBe("pt-BR");
    // European Portuguese remains on the only selectable Portuguese catalog until its own is complete.
    expect(resolveInterfaceLanguage("pt-PT")).toBe("pt-BR");
    expect(resolveInterfaceLanguage("ru-RU")).toBeUndefined();
    expect(resolveInterfaceLanguage("zh-Hant-HK")).toBe("zh-Hant");
    expect(resolveInterfaceLanguage("zh-Hans-SG")).toBe("zh-Hans");
  });

  it("resolves RTL direction for scripts beyond the currently translated locale set", () => {
    expect(getInterfaceLanguageDirection("ar")).toBe("rtl");
    expect(getInterfaceLanguageDirection("fa-IR")).toBe("rtl");
    expect(getInterfaceLanguageDirection("he-IL")).toBe("rtl");
    expect(getInterfaceLanguageDirection("en")).toBe("ltr");
  });

  it("routes stable navigation IDs through the existing complete locale catalog", () => {
    expect(translateInterfaceMessage("navigation.library", "es")).toBe(
      translateInterfaceLabel("Library", "es")
    );
    expect(translateInterfaceMessage("navigation.library", "en")).toBe("Library");
  });

  it("parses localized digits, decimal separators, and grouping", () => {
    expect(parseRegionalNumber("١٬٢٣٤٫٥", "ar")).toBe(1234.5);
    expect(parseRegionalNumber("1 234,5", "fr")).toBe(1234.5);
    expect(parseRegionalNumber("1,23,45,678.5", "en-IN")).toBe(12345678.5);
  });

  it("rejects ambiguous or malformed locale grouping", () => {
    expect(parseRegionalNumber("12,34.5", "en-US")).toBeNull();
    expect(parseRegionalNumber("1.234,5", "en-US")).toBeNull();
    expect(parseRegionalNumber("", "en-US")).toBeNull();
  });

  it("formats dates through the shared regional formatter", () => {
    const date = new Date("2026-05-17T12:00:00.000Z");
    const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
    expect(formatRegionalDate(date, options, "es-419")).toBe(
      new Intl.DateTimeFormat("es-419", options).format(date)
    );
  });

  it("formats numbers using regional variant preferences", () => {
    expect(formatRegionalNumber(1234.5, undefined, "es-419")).toBe(
      new Intl.NumberFormat("es-419").format(1234.5)
    );
    expect(formatRegionalNumber(1234.5, undefined, "fr-CA")).toBe(
      new Intl.NumberFormat("fr-CA").format(1234.5)
    );
  });

  it("formats relative time in the interface locale with regional digits", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const expected = new Intl.RelativeTimeFormat("ru", { numeric: "always" })
      .formatToParts(-3, "hour")
      .map((part) =>
        part.type === "integer"
          ? new Intl.NumberFormat("ar", { useGrouping: false }).format(Number(part.value))
          : part.value
      )
      .join("");
    expect(formatRegionalDistanceToNow(date, "ru", "ar")).toBe(expected);
  });

  it("formats measurement units through Intl.NumberFormat", () => {
    const expected = new Intl.NumberFormat("fr", {
      style: "unit",
      unit: "kilometer",
      unitDisplay: "long",
    }).format(2);
    expect(formatRegionalUnit(2, "kilometer", { unitDisplay: "long" }, "fr")).toBe(expected);
  });
});
