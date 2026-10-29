import { formatDistanceToNow } from "date-fns";
import { useSyncExternalStore } from "react";
import {
  formatInterfacePluralMessage,
  getInterfaceLanguage,
  type InterfacePluralForms,
  type InterfaceLanguage,
} from "./interface-locale";
import { getLocaleDirection } from "./locale-direction";
import {
  ar,
  de,
  enAU,
  enCA,
  enGB,
  enNZ,
  enUS,
  es,
  fr,
  hi,
  id,
  ja,
  ko,
  pt,
  ptBR,
  vi,
  zhCN,
  zhHK,
  zhTW,
} from "date-fns/locale";

export const REGIONAL_FORMAT_KEY = "questarrng.regional-format";

export const REGIONAL_FORMAT_OPTIONS = [
  { value: "system", label: "Use browser settings" },
  { value: "en", nativeName: "English", englishName: "English" },
  { value: "es", nativeName: "Español", englishName: "Spanish" },
  { value: "es-419", nativeName: "Español (Latinoamérica)", englishName: "Spanish (Latin America)" },
  { value: "zh-CN", nativeName: "简体中文", englishName: "Chinese (Simplified)" },
  { value: "hi-IN", nativeName: "हिन्दी", englishName: "Hindi" },
  { value: "de", nativeName: "Deutsch", englishName: "German" },
  { value: "ja", nativeName: "日本語", englishName: "Japanese" },
  { value: "fr", nativeName: "Français", englishName: "French" },
  { value: "fr-CA", nativeName: "Français (Canada)", englishName: "French (Canada)" },
  { value: "pt-BR", nativeName: "Português (Brasil)", englishName: "Brazilian Portuguese" },
  { value: "ar", nativeName: "العربية", englishName: "Arabic" },
  { value: "ko", nativeName: "한국어", englishName: "Korean" },
  { value: "zh-TW", nativeName: "繁體中文", englishName: "Chinese (Traditional)" },
  { value: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese" },
  { value: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian" },
  { value: "az", nativeName: "Azərbaycanca", englishName: "Azerbaijani" },
  { value: "bg", nativeName: "Български", englishName: "Bulgarian" },
  { value: "bn", nativeName: "বাংলা", englishName: "Bengali" },
  { value: "cs", nativeName: "Čeština", englishName: "Czech" },
  { value: "da", nativeName: "Dansk", englishName: "Danish" },
  { value: "fa", nativeName: "فارسی", englishName: "Persian" },
  { value: "he", nativeName: "עברית", englishName: "Hebrew" },
  { value: "hu", nativeName: "Magyar", englishName: "Hungarian" },
  { value: "it", nativeName: "Italiano", englishName: "Italian" },
  { value: "kk", nativeName: "Қазақша", englishName: "Kazakh" },
  { value: "ms", nativeName: "Bahasa Melayu", englishName: "Malay" },
  { value: "nb", nativeName: "Norsk bokmål", englishName: "Norwegian Bokmål" },
  { value: "nl", nativeName: "Nederlands", englishName: "Dutch" },
  { value: "pl", nativeName: "Polski", englishName: "Polish" },
  { value: "pt", nativeName: "Português", englishName: "Portuguese" },
  { value: "pt-PT", nativeName: "Português (Portugal)", englishName: "European Portuguese" },
  { value: "ru", nativeName: "Русский", englishName: "Russian" },
  { value: "sv", nativeName: "Svenska", englishName: "Swedish" },
  { value: "th", nativeName: "ไทย", englishName: "Thai" },
  { value: "tr", nativeName: "Türkçe", englishName: "Turkish" },
  { value: "uk", nativeName: "Українська", englishName: "Ukrainian" },
  { value: "uz", nativeName: "Oʻzbekcha", englishName: "Uzbek" },
] as const;

const supportedRegionalFormats = new Set<string>(
  REGIONAL_FORMAT_OPTIONS.map((option) => option.value)
);

const regionalPreferenceListeners = new Set<() => void>();

function normalizeRegionalPreference(value: string | null): string {
  return value && supportedRegionalFormats.has(value) ? value : "system";
}

function readRegionalPreference(): string {
  try {
    return typeof localStorage === "undefined"
      ? "system"
      : normalizeRegionalPreference(localStorage.getItem(REGIONAL_FORMAT_KEY));
  } catch {
    return "system";
  }
}

let activeRegionalPreference = readRegionalPreference();

function notifyRegionalPreferenceListeners() {
  regionalPreferenceListeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== REGIONAL_FORMAT_KEY && event.key !== null) return;
    activeRegionalPreference = readRegionalPreference();
    notifyRegionalPreferenceListeners();
  });
}

export function getRegionalPreference(): string {
  return activeRegionalPreference;
}

export function setRegionalPreference(value: string): void {
  if (!supportedRegionalFormats.has(value)) return;
  activeRegionalPreference = value;
  try {
    localStorage.setItem(REGIONAL_FORMAT_KEY, value);
  } catch {
    // Keep this tab's chosen format active when browser storage is unavailable.
  }
  notifyRegionalPreferenceListeners();
}

export function useRegionalPreference(): string {
  return useSyncExternalStore(
    (listener) => {
      regionalPreferenceListeners.add(listener);
      return () => regionalPreferenceListeners.delete(listener);
    },
    getRegionalPreference,
    () => "system"
  );
}

const dateFnsLocales = {
  ar,
  de,
  en: enUS,
  "en-au": enAU,
  "en-ca": enCA,
  "en-gb": enGB,
  "en-nz": enNZ,
  "en-us": enUS,
  es,
  fr,
  hi,
  id,
  ja,
  ko,
  pt,
  "pt-br": ptBR,
  vi,
  "zh-cn": zhCN,
  "zh-hk": zhHK,
  "zh-tw": zhTW,
} as const;

type RegionalDateFnsLocale = (typeof dateFnsLocales)[keyof typeof dateFnsLocales];

// CLDR supplemental weekData territory overrides, converted to Date weekday indexes.
const sundayFirstRegions = new Set(
  "AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW".split(
    " "
  )
);
const saturdayFirstRegions = new Set("AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY".split(" "));

function getLocaleRegion(locale: string): string | undefined {
  const subtags = locale.replaceAll("_", "-").split("-");
  const unicodeExtensionIndex = subtags.findIndex((subtag, index) => index > 0 && subtag === "u");

  if (unicodeExtensionIndex >= 0) {
    const unicodeExtension = subtags.slice(unicodeExtensionIndex + 1);
    const regionOverrideIndex = unicodeExtension.indexOf("rg");
    const regionOverride =
      unicodeExtension[regionOverrideIndex + 1]?.match(/^([a-z]{2}|\d{3})zzzz$/i)?.[1];
    if (regionOverride) return regionOverride.toUpperCase();
  }

  const baseSubtags =
    unicodeExtensionIndex < 0 ? subtags.slice(1) : subtags.slice(1, unicodeExtensionIndex);
  return baseSubtags.find((subtag) => /^[a-z]{2}$|^\d{3}$/i.test(subtag))?.toUpperCase();
}

function getRegionWeekStartsOn(locale: string): number | undefined {
  const region = getLocaleRegion(locale);
  if (!region) return undefined;

  if (sundayFirstRegions.has(region)) return 0;
  if (saturdayFirstRegions.has(region)) return 6;
  if (region === "MV") return 5;

  // Monday is CLDR's default for regions without an explicit first-day override.
  return 1;
}

function getCurrentLocale(preference = getRegionalPreference()): string {
  const regionalLocale = getRegionalLocale(preference);
  if (regionalLocale) return regionalLocale;

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

function getDateFnsLocale(locale: string): RegionalDateFnsLocale | undefined {
  const normalizedLocale = locale.replaceAll("_", "-").toLowerCase();
  const exactLocale = dateFnsLocales[normalizedLocale as keyof typeof dateFnsLocales];
  if (exactLocale) return exactLocale;

  if (normalizedLocale.startsWith("zh-hant")) return zhTW;
  if (normalizedLocale.startsWith("zh")) return zhCN;

  const language = normalizedLocale.split("-")[0] ?? "en";
  return dateFnsLocales[language as keyof typeof dateFnsLocales];
}

export function getRegionalLocale(preference = getRegionalPreference()): string | undefined {
  return preference === "system" ? undefined : preference;
}

export function getRegionalDirection(locale?: string): "ltr" | "rtl" {
  const normalizedLocale =
    locale ?? getRegionalLocale() ?? Intl.DateTimeFormat().resolvedOptions().locale;
  return getLocaleDirection(normalizedLocale);
}

export function getRegionalCollator(
  options?: Intl.CollatorOptions,
  preference = getRegionalPreference()
): Intl.Collator {
  return new Intl.Collator(getCurrentLocale(preference), { sensitivity: "base", ...options });
}

export function formatRegionalNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  preference = getRegionalPreference()
): string {
  return new Intl.NumberFormat(getCurrentLocale(preference), options).format(value);
}

/** Plural grammar follows the interface language; digits follow the regional preference. */
export function formatRegionalPluralMessage(
  count: number,
  forms: InterfacePluralForms,
  values: Record<string, string | number> = {},
  interfaceLanguage: InterfaceLanguage = getInterfaceLanguage(),
  preference = getRegionalPreference()
): string {
  return formatInterfacePluralMessage(
    count,
    forms,
    values,
    interfaceLanguage,
    formatRegionalNumber(count, undefined, preference)
  );
}

export function formatRegionalDate(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
  preference = getRegionalPreference()
): string {
  return new Intl.DateTimeFormat(getCurrentLocale(preference), {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

export function formatRegionalPercent(
  percent: number,
  options?: Omit<Intl.NumberFormatOptions, "style">,
  preference = getRegionalPreference()
): string {
  return new Intl.NumberFormat(getCurrentLocale(preference), {
    style: "percent",
    ...options,
  }).format(percent / 100);
}

export type RegionalUnit = NonNullable<Intl.NumberFormatOptions["unit"]>;

/** Format a quantity with the locale's number rules and translated unit label. */
export function formatRegionalUnit(
  value: number,
  unit: RegionalUnit,
  options: Omit<Intl.NumberFormatOptions, "style" | "unit"> = {},
  preference = getRegionalPreference()
): string {
  return new Intl.NumberFormat(getCurrentLocale(preference), {
    ...options,
    style: "unit",
    unit,
  }).format(value);
}

/** Parse a plain numeric field using the selected locale's digits and separators. */
export function parseRegionalNumber(
  input: string,
  locale = getCurrentLocale()
): number | null {
  const value = input.trim();
  if (!value) return null;

  const parts = new Intl.NumberFormat(locale).formatToParts(-1234567890123.5);
  const groupToken = parts.find((part) => part.type === "group")?.value;
  const decimalToken = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const minusToken = parts.find((part) => part.type === "minusSign")?.value ?? "-";
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  let normalized = value.replace(/[\u200e\u200f\u061c]/gu, "");

  for (let digit = 0; digit <= 9; digit += 1) {
    const localizedDigit = digitFormatter.format(digit);
    if (localizedDigit !== String(digit)) {
      normalized = normalized.replaceAll(localizedDigit, String(digit));
    }
  }
  if (minusToken !== "-") normalized = normalized.replaceAll(minusToken, "-");
  normalized = normalized.replace("−", "-");
  if (groupToken && /[\u0020\u00a0\u202f]/u.test(groupToken)) {
    normalized = normalized.replace(/[\u0020\u00a0\u202f]/gu, groupToken);
  }

  let sign = "";
  if (normalized.startsWith("-") || normalized.startsWith("+")) {
    sign = normalized[0]!;
    normalized = normalized.slice(1);
  }
  if (!normalized || normalized.includes("-") || normalized.includes("+")) return null;

  const decimalParts = normalized.split(decimalToken);
  if (decimalParts.length > 2) return null;
  const [integerPart = "", fractionPart] = decimalParts;
  if (fractionPart !== undefined && !/^\d+$/u.test(fractionPart)) return null;
  if (fractionPart !== undefined && groupToken && fractionPart.includes(groupToken)) return null;

  let integerDigits = integerPart;
  if (groupToken && integerPart.includes(groupToken)) {
    const groups = integerPart.split(groupToken);
    if (groups.some((group) => !/^\d+$/u.test(group))) return null;
    const integerGroups = parts.filter((part) => part.type === "integer").map((part) => part.value);
    const primaryGroupSize = integerGroups.at(-1)?.length ?? 3;
    const secondaryGroupSize = integerGroups.at(-2)?.length ?? primaryGroupSize;
    if (
      groups.length < 2 ||
      groups[0]!.length < 1 ||
      groups[0]!.length > secondaryGroupSize ||
      groups.at(-1)!.length !== primaryGroupSize ||
      groups.slice(1, -1).some((group) => group.length !== secondaryGroupSize)
    ) {
      return null;
    }
    integerDigits = groups.join("");
  }

  if (!/^\d*$/u.test(integerDigits) || (!integerDigits && fractionPart === undefined)) return null;
  const canonical =
    sign + (integerDigits || "0") + (fractionPart === undefined ? "" : "." + fractionPart);
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRegionalDateFnsLocale(): RegionalDateFnsLocale | undefined {
  return getDateFnsLocale(getCurrentLocale());
}

export function getRegionalWeekStartsOn(): number {
  const locale = getCurrentLocale();

  try {
    const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay =
      localeWithWeekInfo.getWeekInfo?.().firstDay ?? localeWithWeekInfo.weekInfo?.firstDay;

    // Intl uses ISO numbering (Monday=1 through Sunday=7); Date uses Sunday=0.
    if (firstDay !== undefined && Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7) {
      return firstDay % 7;
    }
  } catch {
    // Older browsers may not expose Intl.Locale week data.
  }

  const regionWeekStartsOn = getRegionWeekStartsOn(locale);
  if (regionWeekStartsOn !== undefined) return regionWeekStartsOn;

  const normalizedLocale = locale.replaceAll("_", "-").toLowerCase();
  // date-fns currently marks zhTW as Monday-first, but CLDR uses Sunday for Taiwan.
  if (normalizedLocale === "zh-tw" || normalizedLocale.startsWith("zh-hant")) return 0;

  return getDateFnsLocale(locale)?.options?.weekStartsOn ?? 1;
}

function formatIntlRelativeDistance(
  date: Date,
  interfaceLanguage: string,
  regionalPreference: string
): string {
  const deltaSeconds = (date.getTime() - Date.now()) / 1000;
  const absoluteSeconds = Math.abs(deltaSeconds);
  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absoluteSeconds < 45) {
    value = Math.round(deltaSeconds);
    unit = "second";
  } else if (absoluteSeconds < 90) {
    value = Math.sign(deltaSeconds);
    unit = "minute";
  } else if (absoluteSeconds < 45 * 60) {
    value = Math.round(deltaSeconds / 60);
    unit = "minute";
  } else if (absoluteSeconds < 90 * 60) {
    value = Math.sign(deltaSeconds);
    unit = "hour";
  } else if (absoluteSeconds < 22 * 60 * 60) {
    value = Math.round(deltaSeconds / (60 * 60));
    unit = "hour";
  } else if (absoluteSeconds < 36 * 60 * 60) {
    value = Math.sign(deltaSeconds);
    unit = "day";
  } else if (absoluteSeconds < 26 * 24 * 60 * 60) {
    value = Math.round(deltaSeconds / (24 * 60 * 60));
    unit = "day";
  } else if (absoluteSeconds < 46 * 24 * 60 * 60) {
    value = Math.sign(deltaSeconds);
    unit = "month";
  } else if (absoluteSeconds < 320 * 24 * 60 * 60) {
    value = Math.round(deltaSeconds / (30 * 24 * 60 * 60));
    unit = "month";
  } else if (absoluteSeconds < 548 * 24 * 60 * 60) {
    value = Math.sign(deltaSeconds);
    unit = "year";
  } else {
    value = Math.round(deltaSeconds / (365 * 24 * 60 * 60));
    unit = "year";
  }

  const parts = new Intl.RelativeTimeFormat(interfaceLanguage, { numeric: "always" }).formatToParts(
    value,
    unit
  );
  return parts
    .map((part) =>
      part.type === "integer"
        ? formatRegionalNumber(Number(part.value), { useGrouping: false }, regionalPreference)
        : part.value
    )
    .join("");
}

export function formatRegionalDistanceToNow(
  date: Date,
  interfaceLanguage = getInterfaceLanguage(),
  regionalPreference = getRegionalPreference()
): string {
  const interfaceLocale = getDateFnsLocale(interfaceLanguage);
  if (!interfaceLocale) {
    return formatIntlRelativeDistance(date, interfaceLanguage, regionalPreference);
  }
  // Keep existing date-fns wording and plural rules, but format its count with the separate regional choice.
  const regionalizedLocale = {
    ...interfaceLocale,
    formatDistance: (
      token: Parameters<typeof interfaceLocale.formatDistance>[0],
      count: number,
      options?: Parameters<typeof interfaceLocale.formatDistance>[2]
    ) =>
      interfaceLocale
        .formatDistance(token, count, options)
        .replace(
          String(count),
          formatRegionalNumber(count, { useGrouping: false }, regionalPreference)
        ),
  };

  return formatDistanceToNow(date, { addSuffix: true, locale: regionalizedLocale });
}
