import { serviceMessage } from "../../shared/service-messages.js";
import { describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_LANGUAGES,
  readNotificationLanguage,
} from "../../shared/notification-language.js";
import { localizeOutboundNotification, MESSAGES } from "../../shared/notification-messages.js";
import { updateUserSettingsSchema } from "../../shared/schema.js";
import { resolvePrefs } from "../notification-prefs.js";

vi.mock("../logger.js", () => ({
  igdbLogger: { warn: vi.fn() },
  logger: { child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
vi.mock("../db.js", () => ({ dialect: "sqlite", pool: {}, db: {} }));

const title = "Download Completed";
const message = "Download finished for A Game";

describe("notification language preference", () => {
  it.each([
    undefined,
    null,
    "",
    "{}",
    "null",
    "[]",
    "bad JSON",
    '{"language":"xx"}',
    '{"language":42}',
  ])("defaults legacy/invalid preferences to English: %s", (value) => {
    expect(readNotificationLanguage(value)).toBe("en");
    expect(resolvePrefs({ notificationPreferences: value }).language).toBe("en");
  });

  it.each(NOTIFICATION_LANGUAGES)(
    "persists the independent %s preference through settings storage",
    async (language) => {
      const { MemStorage } = await import("../storage.js");
      const storage = new MemStorage();
      await storage.createUserSettings({ userId: "notification-language-user" });
      const prefs = JSON.stringify({
        language,
        downloadCompleted: { inApp: true, apprise: false },
      });
      const updates = updateUserSettingsSchema.parse({ notificationPreferences: prefs });
      await storage.updateUserSettings("notification-language-user", updates);
      const loaded = await storage.getUserSettings("notification-language-user");
      expect(readNotificationLanguage(loaded?.notificationPreferences)).toBe(language);
      expect(resolvePrefs(loaded).downloadCompleted.apprise).toBe(false);
      expect(resolvePrefs(loaded).gameReleased.inApp).toBe(true);
    }
  );
});

describe("outbound notification rendering", () => {
  it("does not fall through to legacy matching or expose an unrelated translated source", () => {
    for (const metadata of [
      "bad JSON",
      serviceMessage("service.connected_named", { name: "UNRELATED PROVIDER" }),
    ]) {
      const result = localizeOutboundNotification(title, message, "de", metadata);
      expect(result.message).toBe(message);
      expect(result.message).not.toContain("UNRELATED PROVIDER");
    }
  });

  it.each(NOTIFICATION_LANGUAGES.filter((locale) => locale !== "en"))(
    "renders source-bound titles and bodies in %s",
    (locale) => {
      const result = localizeOutboundNotification(title, message, locale);
      expect(result.title).not.toBe(title);
      expect(result.message).not.toBe(message);
      expect(result.message).toContain("A Game");
      expect(result.message).not.toMatch(/\{[a-z]+\}/);
      expect(
        localizeOutboundNotification("Questarr", "Test notification from Questarr", locale).message
      ).not.toBe("Test notification from Questarr");
    }
  );
  it("keeps English and unknown content intact, including provider details", () => {
    expect(localizeOutboundNotification(title, message, "unsupported")).toEqual({ title, message });
    expect(localizeOutboundNotification("Provider title", "raw provider payload", "de")).toEqual({
      title: "Provider title",
      message: "raw provider payload",
    });
    const result = localizeOutboundNotification(
      "Auto-delete failed",
      '"A Game" was imported successfully, but removing it from the download client failed: Provider: 429 /a/path. Please remove it manually.',
      "de"
    );
    expect(result.message).toContain("Provider: 429 /a/path");
  });
  it("inherits established regional catalogs and isolates Arabic dynamic values", () => {
    expect(localizeOutboundNotification(title, message, "es-419")).toEqual(
      localizeOutboundNotification(title, message, "es")
    );
    expect(localizeOutboundNotification(title, message, "fr-CA")).toEqual(
      localizeOutboundNotification(title, message, "fr")
    );
    expect(localizeOutboundNotification(title, message, "ar").message).toContain(
      "\u2068A Game\u2069"
    );
  });
  it("has all twelve direct translations for every source template", () => {
    for (const templates of Object.values(MESSAGES)) {
      expect(templates).toHaveLength(12);
      expect(templates.every(Boolean)).toBe(true);
    }
  });
});
