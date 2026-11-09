/** Server notification preferences are independent of browser interface state. */
export const NOTIFICATION_LANGUAGES = [
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
] as const;

export type NotificationLanguage = (typeof NOTIFICATION_LANGUAGES)[number];

export function normalizeNotificationLanguage(value: unknown): NotificationLanguage {
  return typeof value === "string" && NOTIFICATION_LANGUAGES.includes(value as NotificationLanguage)
    ? (value as NotificationLanguage)
    : "en";
}

export function readNotificationLanguage(
  preferences: string | null | undefined
): NotificationLanguage {
  if (!preferences) return "en";
  try {
    const value: unknown = JSON.parse(preferences);
    return value && typeof value === "object" && !Array.isArray(value)
      ? normalizeNotificationLanguage((value as { language?: unknown }).language)
      : "en";
  } catch {
    return "en";
  }
}

export function notificationCatalogLanguage(language: NotificationLanguage): NotificationLanguage {
  if (language === "es-419") return "es";
  if (language === "fr-CA") return "fr";
  return language;
}
