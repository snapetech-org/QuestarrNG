import { readNotificationLanguage } from "../shared/notification-language.js";
import { igdbLogger } from "./logger.js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "../shared/schema.js";

/**
 * Parses a user's stored `notificationPreferences` JSON blob, falling back to
 * `DEFAULT_NOTIFICATION_PREFERENCES` (merged in, so new event types added after a
 * user's preferences were last saved still get a sane default) if missing/invalid.
 *
 * Shared between cron.ts (game/download/xREL/steam notifications) and
 * error-telemetry.ts (automatic error-detected notifications).
 */
export function resolvePrefs(
  settings: { notificationPreferences?: string | null } | null | undefined
): NotificationPreferences {
  if (!settings?.notificationPreferences) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const parsed: unknown = JSON.parse(settings.notificationPreferences);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return DEFAULT_NOTIFICATION_PREFERENCES;
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parsed,
      language: readNotificationLanguage(settings.notificationPreferences),
    };
  } catch {
    igdbLogger.warn(
      { length: settings.notificationPreferences?.length ?? 0 },
      "Failed to parse notification preferences, using defaults"
    );
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}
