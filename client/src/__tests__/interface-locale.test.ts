import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

import {
  INTERFACE_LANGUAGE_OPTIONS,
  applyInitialInterfaceLanguage,
  formatInterfaceMessage,
  getBrowserInterfaceLanguage,
  getInterfaceCollator,
  getInterfaceLanguage,
  getInterfaceTextDirection,
  getInterfaceTextLanguage,
  setInterfaceLanguage,
  translateInterfaceLabel,
  useInterfaceLanguage,
} from "@/lib/interface-locale";
import type { InterfaceLanguage } from "@/lib/interface-locale";

describe("browser interface language detection", () => {
  it.each([
    ["en-US", "en"],
    ["es-ES", "es"],
    ["zh-CN", "zh-Hans"],
    ["zh-Hant-HK", "zh-Hant"],
    ["zh-Hans-TW", "zh-Hans"],
    ["zh-Hans-HK", "zh-Hans"],
    ["zh-Hant-CN", "zh-Hant"],
    ["zh-TW", "zh-Hant"],
    ["pt-PT", "pt-BR"],
    ["hi-IN", "hi"],
    ["de-DE", "de"],
    ["ja-JP", "ja"],
    ["fr-FR", "fr"],
    ["ar-SA", "ar"],
    ["ko-KR", "ko"],
    ["vi-VN", "vi"],
    ["id-ID", "id"],
  ])("maps %s to the supported interface language", (locale, expected) => {
    expect(getBrowserInterfaceLanguage({ language: locale, languages: [locale] })).toBe(expected);
  });

  it("uses the browser's primary language when its preference list is empty", () => {
    expect(getBrowserInterfaceLanguage({ language: "fr-CA", languages: [] })).toBe("fr");
  });

  it("skips unsupported preferences and keeps the browser's order", () => {
    expect(getBrowserInterfaceLanguage({ language: "en-US", languages: ["ru-RU", "de-DE"] })).toBe(
      "de"
    );
  });

  it("falls back to English when no browser or supported preference exists", () => {
    expect(getBrowserInterfaceLanguage(null)).toBe("en");
    expect(getBrowserInterfaceLanguage({ language: "ru-RU", languages: ["ru-RU"] })).toBe("en");
  });

  it("uses the current browser when no navigator is supplied", () => {
    expect(INTERFACE_LANGUAGE_OPTIONS.map(({ value }) => value)).toContain(
      getBrowserInterfaceLanguage()
    );
  });

  it("uses English fallbacks and syncs interface language across tabs", () => {
    function LanguageProbe() {
      const { language, t } = useInterfaceLanguage();
      return createElement(
        "span",
        { "data-testid": "language-probe" },
        `${language}:${t("Uncatalogued label")}`
      );
    }

    setInterfaceLanguage("ar");
    render(createElement(LanguageProbe));
    const probe = screen.getByTestId("language-probe");
    expect(probe).toHaveTextContent("ar:Uncatalogued label");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-key" }));
    });
    expect(probe).toHaveTextContent("ar:Uncatalogued label");

    act(() => {
      localStorage.setItem("questarr.interface-language", "fr");
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(probe).toHaveTextContent("fr:Uncatalogued label");

    act(() => {
      localStorage.setItem("questarr.interface-language", "es");
      window.dispatchEvent(new StorageEvent("storage", { key: "questarr.interface-language" }));
    });
    expect(probe).toHaveTextContent("es:Uncatalogued label");
  });

  it("falls back safely when browser storage and document globals are unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("document", undefined);

    try {
      expect(getBrowserInterfaceLanguage()).toBe("en");
      applyInitialInterfaceLanguage();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("translates the fixed two-release label and preserves Arabic dual form", () => {
    function TranslationProbe() {
      const { language, t } = useInterfaceLanguage();
      return createElement(
        "span",
        { "data-testid": "translation-probe" },
        `${language}:${t("two releases")}`
      );
    }

    render(createElement(TranslationProbe));
    const probe = screen.getByTestId("translation-probe");
    for (const { value } of INTERFACE_LANGUAGE_OPTIONS) {
      act(() => setInterfaceLanguage(value));
      const text = probe.textContent ?? "";
      if (value === "en") expect(text).toBe("en:two releases");
      else if (value === "ar") expect(text).toBe("ar:إصداران");
      else expect(text.slice(value.length + 1)).not.toBe("two releases");
    }

    setInterfaceLanguage("en");
  });

  it("isolates interpolated values only in right-to-left messages", () => {
    expect(
      formatInterfaceMessage("Change status for {title}", { title: "Example game" }, "en")
    ).toBe("Change status for Example game");
    expect(
      formatInterfaceMessage("Change status for {title}", { title: "Example game" }, "ar")
    ).toContain("\u2068Example game\u2069");
    expect(formatInterfaceMessage("Uncatalogued {missing}", {}, "es")).toBe(
      "Uncatalogued {missing}"
    );
    expect(formatInterfaceMessage("Navigation", {}, "unsupported" as InterfaceLanguage)).toBe(
      "Navigation"
    );
  });

  it("localizes marked attributes and filters invalid interpolation data", () => {
    const button = document.createElement("button");
    button.setAttribute("data-i18n-aria-label", "Selection: {count}/{total}");
    button.setAttribute(
      "data-i18n-aria-label-values",
      JSON.stringify({ count: 2, total: "4", invalid: true })
    );
    const title = document.createElement("span");
    title.setAttribute("data-i18n-title", "Navigation");
    title.setAttribute("data-i18n-title-values", "[]");
    document.body.append(button, title);

    try {
      setInterfaceLanguage("ar");
      expect(button.getAttribute("aria-label")).toContain("\u20682\u2069");
      expect(button.getAttribute("aria-label")).toContain("\u20684\u2069");
      expect(title.getAttribute("title")).toBe(translateInterfaceLabel("Navigation", "ar"));
    } finally {
      button.remove();
      title.remove();
      setInterfaceLanguage("en");
    }
  });

  it("updates only the marked element when its source or interpolation attributes change", async () => {
    const source = "View {value} on xREL";
    const button = document.createElement("button");
    button.setAttribute("data-i18n-aria-label", source);
    button.setAttribute("data-i18n-aria-label-values", JSON.stringify({ value: "First release" }));
    const unrelated = document.createElement("button");
    unrelated.setAttribute("data-i18n-aria-label", "Navigation");
    unrelated.setAttribute("aria-label", translateInterfaceLabel("Navigation", "es"));
    document.body.append(button, unrelated);

    try {
      setInterfaceLanguage("es");
      await waitFor(() => {
        expect(button.getAttribute("aria-label")).toBe(
          formatInterfaceMessage(source, { value: "First release" }, "es")
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const unrelatedSetAttribute = vi.spyOn(unrelated, "setAttribute");

      button.setAttribute(
        "data-i18n-aria-label-values",
        JSON.stringify({ value: "Second release" })
      );
      await waitFor(() => {
        expect(button.getAttribute("aria-label")).toBe(
          formatInterfaceMessage(source, { value: "Second release" }, "es")
        );
      });

      button.setAttribute("data-i18n-aria-label", "View original article for {title}");
      button.setAttribute(
        "data-i18n-aria-label-values",
        JSON.stringify({ title: "A new article" })
      );
      await waitFor(() => {
        expect(button.getAttribute("aria-label")).toBe(
          formatInterfaceMessage(
            "View original article for {title}",
            { title: "A new article" },
            "es"
          )
        );
      });

      expect(unrelated.getAttribute("aria-label")).toBe(
        translateInterfaceLabel("Navigation", "es")
      );
      expect(unrelatedSetAttribute).not.toHaveBeenCalled();
    } finally {
      button.remove();
      unrelated.remove();
      setInterfaceLanguage("en");
    }
  });

  it("keeps the selected language active when browser storage is blocked", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    try {
      expect(() => setInterfaceLanguage("es")).not.toThrow();
      expect(getInterfaceLanguage()).toBe("es");
    } finally {
      setItem.mockRestore();
      setInterfaceLanguage("en");
    }
  });
});

describe("interface text language metadata", () => {
  beforeEach(() => {
    localStorage.setItem("questarr.interface-language", "ar");
    applyInitialInterfaceLanguage();
  });

  it("marks translated strings with their selected language", () => {
    expect(getInterfaceTextLanguage("Navigation", "ar")).toBe("ar");
    expect(getInterfaceTextLanguage("Navigation", "es")).toBe("es");
  });

  it("marks English fallback strings as English", () => {
    expect(getInterfaceTextLanguage("Uncatalogued label", "ar")).toBe("en");
    expect(getInterfaceTextDirection("Uncatalogued label", "ar")).toBe("ltr");
  });

  it("sets document metadata to the selected interface language", () => {
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(getInterfaceTextDirection("Navigation", "ar")).toBe("rtl");
  });

  it("uses the selected interface language for alphabetical collation", () => {
    const names = ["ñandú", "nube"];

    expect([...names].sort(getInterfaceCollator("es").compare)).toEqual(["nube", "ñandú"]);
    expect([...names].sort(getInterfaceCollator("en").compare)).toEqual(["ñandú", "nube"]);
  });

  it("provides download-dialog and nested filter translations for every supported language", () => {
    const sources = [
      "Search...",
      "No items found.",
      "Remove {name}",
      "This result is blacklisted. Review the blacklist in game settings.",
      "One update is available for this game. Select whether to download it with the main game.",
      "Two updates are available for this game. Select whether to download them with the main game.",
      "Download with one update",
      "Download with two updates",
      "Download with {count} updates",
      "Selection: {count}/{total}",
      "No releases",
      "release",
      "releases",
      "two releases",
      "Extras",
      "Updates & Patches",
      "DLC & Expansions",
      "Packs/Addons",
      "grabs",
      "seeders",
      "Today",
      "No Release Date",
      "Release date TBD",
      "Delayed",
      "Was originally scheduled for:",
    ];

    for (const { value } of INTERFACE_LANGUAGE_OPTIONS) {
      if (value === "en") continue;
      for (const source of sources) {
        expect(getInterfaceTextLanguage(source, value), `${source} in ${value}`).toBe(value);
      }
    }
  });
});
