import { describe, expect, it } from "vitest";
import { formatInterfaceMessage, type InterfaceLanguage } from "@/lib/interface-locale";
import {
  DEFAULT_RELEASE_PROFILE,
  evaluateReleases,
  type CustomFormat,
} from "@shared/release-scoring";

const locales: InterfaceLanguage[] = [
  "en",
  "es",
  "es-419",
  "zh-Hans",
  "hi",
  "de",
  "ja",
  "fr",
  "fr-CA",
  "pt-BR",
  "ar",
  "ko",
  "zh-Hant",
  "vi",
  "id",
];

describe("localized matching-rule examples", () => {
  it.each(locales)("keeps the example regex usable by the release matcher in %s", (locale) => {
    const hint = formatInterfaceMessage("interface.e_g_gog_drm_free_df026737", {}, locale);
    const pattern = hint.match(/\([^)]*\)/)?.[0];
    expect(pattern).toBeDefined();
    const format: CustomFormat = {
      id: "example",
      name: "Example",
      enabled: true,
      hardReject: false,
      score: 25,
      specs: [{ field: "title", mode: "regex", value: pattern! }],
    };
    const results = evaluateReleases(
      ["ExampleGame-GOG", "ExampleGame.DRM-free", "ExampleGame-CODEX"].map((title) => ({
        title,
        downloadType: "torrent" as const,
      })),
      { gameTitle: "ExampleGame" },
      DEFAULT_RELEASE_PROFILE,
      [format]
    );
    const matches = new Map(
      results.map(({ item, evaluation }) => [item.title, evaluation.matchedFormats])
    );
    expect(matches.get("ExampleGame-GOG")).toEqual(["example"]);
    expect(matches.get("ExampleGame.DRM-free")).toEqual(["example"]);
    expect(matches.get("ExampleGame-CODEX")).toEqual([]);
  });
});
