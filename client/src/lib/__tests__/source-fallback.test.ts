import { describe, expect, it } from "vitest";
import {
  formatInterfaceMessage,
  getInterfaceTextDirection,
  getInterfaceTextLanguage,
} from "@/lib/interface-locale";

describe("staged English source fallback", () => {
  it.each(["fr", "ar", "fr-CA", "es-419"] as const)(
    "keeps pending count templates in English with correct language metadata for %s",
    (locale) => {
      expect(formatInterfaceMessage("claims.downloads_linked", { count: 2 }, locale)).toBe(
        "Downloads linked to games: 2"
      );
      expect(formatInterfaceMessage("claims.some_downloads_failed", { count: 0 }, locale)).toBe(
        "Some downloads failed to link (0 linked)"
      );
      for (const key of ["claims.downloads_linked", "claims.some_downloads_failed"]) {
        expect(getInterfaceTextLanguage(key, locale)).toBe("en");
        expect(getInterfaceTextDirection(key, locale)).toBe("ltr");
      }
    }
  );
});
