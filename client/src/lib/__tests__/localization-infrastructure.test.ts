import { describe, expect, it } from "vitest";

import {
  formatInterfacePluralMessage,
  formatInterfaceSelectMessage,
  getInterfaceLanguageDirection,
  translateInterfaceLabel,
  translateInterfaceMessage,
} from "@/lib/interface-locale";
import {
  formatRegionalPluralMessage,
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
      translateInterfaceMessage(forms.one, "ar").replace("{count}", oneCount)
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
      formatInterfaceSelectMessage(
        "unknown",
        { other: "interface.cancel_35afca3b" },
        {},
        "en"
      )
    ).toBe("Cancel");
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

  it("formats measurement units through Intl.NumberFormat", () => {
    const expected = new Intl.NumberFormat("fr", {
      style: "unit",
      unit: "kilometer",
      unitDisplay: "long",
    }).format(2);
    expect(formatRegionalUnit(2, "kilometer", { unitDisplay: "long" }, "fr")).toBe(expected);
  });
});
