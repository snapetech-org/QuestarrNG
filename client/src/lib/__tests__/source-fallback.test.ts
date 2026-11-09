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
      const key = "interface.count_games_selected_850a42bc";
      expect(formatInterfaceMessage(key, { count: 2 }, locale)).toBe("2 games selected");
      expect(getInterfaceTextLanguage(key, locale)).toBe("en");
      expect(getInterfaceTextDirection(key, locale)).toBe("ltr");
    }
  );

  it("isolates an RTL title inside a left-to-right Spanish message", () => {
    const id = "interface.added_title_to_your_wanted_list_abe8d624";
    const title = "فيلم 2025 (نسخة)";
    expect(getInterfaceTextDirection(id, "es")).toBe("ltr");
    expect(formatInterfaceMessage(id, { title }, "es")).toContain(`\u2068${title}\u2069`);
  });
});
