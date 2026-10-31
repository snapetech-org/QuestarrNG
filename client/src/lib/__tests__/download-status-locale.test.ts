import { describe, expect, it } from "vitest";
import { getDownloadStatusSource } from "../download-status-locale";
import {
  hasInterfaceMessage,
  INTERFACE_LANGUAGE_OPTIONS,
  translateInterfaceLabel,
} from "../interface-locale";
describe("known download status localization", () => {
  it.each(["completed_pending_import", "manual_review_required", "game_link_required"])(
    "has complete localized labels for %s in both download views",
    (status) => {
      const source = getDownloadStatusSource(status);
      expect(hasInterfaceMessage(source)).toBe(true);
      const english = translateInterfaceLabel(source, "en");
      for (const locale of INTERFACE_LANGUAGE_OPTIONS.filter((locale) => locale.value !== "en"))
        expect(translateInterfaceLabel(source, locale.value)).not.toBe(english);
    }
  );
  it("keeps unknown provider status values raw", () => {
    expect(getDownloadStatusSource("provider: Custom state العربية")).toBe(
      "provider: Custom state العربية"
    );
    expect(getDownloadStatusSource("__proto__")).toBe("__proto__");
  });
});
