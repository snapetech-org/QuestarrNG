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
      one: "one",
      two: "two",
      few: "few",
      many: "many",
      other: "other",
      exact: { "0": "zero" },
    };

    expect(formatInterfacePluralMessage(1, forms, {}, "ar")).toBe("one");
    expect(formatInterfacePluralMessage(2, forms, {}, "ar")).toBe("two");
    expect(formatInterfacePluralMessage(3, forms, {}, "ar")).toBe("few");
    expect(formatInterfacePluralMessage(11, forms, {}, "ar")).toBe("many");
    expect(formatInterfacePluralMessage(0, forms, {}, "ar")).toBe("zero");
  });

  it("keeps plural grammar in the interface language and digits in the regional format", () => {
    const forms = { one: "one {count}", other: "many {count}" };

    expect(formatRegionalPluralMessage(2, forms, {}, "es", "ar")).toBe(
      "many " + new Intl.NumberFormat("ar").format(2)
    );
  });

  it("selects non-numeric message branches with a fallback", () => {
    expect(
      formatInterfaceSelectMessage(
        "download",
        { download: "Download {selection}", other: "Open {selection}" },
        {},
        "en"
      )
    ).toBe("Download download");
    expect(formatInterfaceSelectMessage("unknown", { other: "Open" }, {}, "en")).toBe("Open");
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
