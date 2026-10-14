import { useCallback, useSyncExternalStore } from "react";
import { UI_LABELS } from "./ui-labels";

export const INTERFACE_LANGUAGE_OPTIONS = [
  { value: "en", nativeName: "English", englishName: undefined },
  { value: "es", nativeName: "Español", englishName: "Spanish" },
  { value: "zh-Hans", nativeName: "简体中文", englishName: "Simplified Chinese" },
  { value: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { value: "de", nativeName: "Deutsch", englishName: "German" },
  { value: "ja", nativeName: "日本語", englishName: "Japanese" },
  { value: "fr", nativeName: "Français", englishName: "French" },
  { value: "pt-BR", nativeName: "Português (Brasil)", englishName: "Brazilian Portuguese" },
  { value: "ar", nativeName: "العربية", englishName: "Arabic" },
  { value: "ko", nativeName: "한국어", englishName: "Korean" },
  { value: "zh-Hant", nativeName: "繁體中文", englishName: "Traditional Chinese" },
  { value: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese" },
  { value: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian" },
] as const;

export type InterfaceLanguage = (typeof INTERFACE_LANGUAGE_OPTIONS)[number]["value"];
const STORAGE_KEY = "questarr.interface-language";
const listeners = new Set<() => void>();
const LOCALIZABLE_ATTRIBUTES = ["title", "placeholder", "aria-label", "alt"] as const;
const LOCALIZABLE_ATTRIBUTE_MARKERS = LOCALIZABLE_ATTRIBUTES.flatMap((target) => [
  `data-i18n-${target}`,
  `data-i18n-${target}-values`,
]);

export function getInterfaceCollator(
  language: InterfaceLanguage = "en",
  options?: Intl.CollatorOptions
): Intl.Collator {
  return new Intl.Collator(language, { sensitivity: "base", ...options });
}

function isInterfaceLanguage(value: string | null): value is InterfaceLanguage {
  return INTERFACE_LANGUAGE_OPTIONS.some((option) => option.value === value);
}

export function getBrowserInterfaceLanguage(
  browser: Pick<Navigator, "language" | "languages"> | null = typeof navigator === "undefined"
    ? null
    : navigator
): InterfaceLanguage {
  if (!browser) return "en";
  for (const candidate of browser.languages?.length ? browser.languages : [browser.language]) {
    const normalized = candidate.toLowerCase();
    const base = normalized.split(/[-_]/)[0];
    if (base === "en") return "en";
    if (base === "zh") {
      const subtags = normalized.split(/[-_]/);
      if (subtags.includes("hans")) return "zh-Hans";
      if (subtags.includes("hant")) return "zh-Hant";
      return subtags.some((subtag) => subtag === "tw" || subtag === "hk" || subtag === "mo")
        ? "zh-Hant"
        : "zh-Hans";
    }
    if (base === "pt") return "pt-BR";
    if (
      base === "es" ||
      base === "hi" ||
      base === "de" ||
      base === "ja" ||
      base === "fr" ||
      base === "ar" ||
      base === "ko" ||
      base === "vi" ||
      base === "id"
    )
      return base;
  }
  return "en";
}

function browserLanguage(): InterfaceLanguage {
  return getBrowserInterfaceLanguage();
}

function readLanguage(): InterfaceLanguage {
  try {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    return isInterfaceLanguage(stored) ? stored : browserLanguage();
  } catch {
    return browserLanguage();
  }
}

export function getInterfaceTextLanguage(
  source: string,
  language: InterfaceLanguage
): InterfaceLanguage {
  if (language === "en") return "en";
  if (!Object.hasOwn(UI_LABELS, source)) return "en";
  const entry = (UI_LABELS as Record<string, Partial<Record<InterfaceLanguage, string>>>)[source];
  return entry?.[language] && entry[language] !== source ? language : "en";
}

export function getInterfaceTextDirection(
  source: string,
  language: InterfaceLanguage
): "ltr" | "rtl" {
  return getInterfaceLanguageDirection(getInterfaceTextLanguage(source, language));
}

export function formatInterfaceMessage(
  source: string,
  values: Record<string, string | number>,
  language: InterfaceLanguage = getInterfaceLanguage()
): string {
  const labels = UI_LABELS as Record<string, Partial<Record<InterfaceLanguage, string>>>;
  const template = Object.hasOwn(UI_LABELS, source)
    ? (labels[source]?.[language] ?? source)
    : source;
  const isolateValues = getInterfaceTextDirection(source, language) === "rtl";
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) return placeholder;
    return isolateValues ? `\u2068${String(value)}\u2069` : String(value);
  });
}

function applyDocumentLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = activeLanguage;
  document.documentElement.dir = getInterfaceLanguageDirection(activeLanguage);
  localizeMarkedAttributes(document.documentElement);
  if (!attributeObserver && typeof MutationObserver !== "undefined") {
    attributeObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target instanceof Element) localizeMarkedAttributes(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) localizeMarkedAttributes(node);
        }
      }
    });
    attributeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: LOCALIZABLE_ATTRIBUTE_MARKERS,
    });
  }
}

let attributeObserver: MutationObserver | undefined;

function localizeMarkedAttributes(root: Element) {
  const elements = [
    root,
    ...root.querySelectorAll(
      "[data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-alt]"
    ),
  ];
  for (const element of elements) {
    for (const target of LOCALIZABLE_ATTRIBUTES) {
      const marker = `data-i18n-${target}`;
      const source = element.getAttribute(marker);
      if (source === null) continue;
      const rawValues = element.getAttribute(`data-i18n-${target}-values`);
      let values: Record<string, string | number> | undefined;
      if (rawValues) {
        try {
          const parsed: unknown = JSON.parse(rawValues);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            values = Object.fromEntries(
              Object.entries(parsed).filter(
                (entry): entry is [string, string | number] =>
                  typeof entry[1] === "string" || typeof entry[1] === "number"
              )
            );
          }
        } catch {
          values = undefined;
        }
      }
      const text = values
        ? formatInterfaceMessage(source, values, activeLanguage)
        : translateInterfaceLabel(source, activeLanguage);
      element.setAttribute(target, text);
    }
  }
}

let activeLanguage = readLanguage();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    activeLanguage = readLanguage();
    applyDocumentLanguage();
    notify();
  });
}

export function applyInitialInterfaceLanguage() {
  activeLanguage = readLanguage();
  applyDocumentLanguage();
}

export function setInterfaceLanguage(language: InterfaceLanguage) {
  activeLanguage = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Keep the current tab usable when browser storage is disabled.
  }
  applyDocumentLanguage();
  notify();
}

export function getInterfaceLanguage(): InterfaceLanguage {
  return activeLanguage;
}

export function translateInterfaceLabel(
  source: string,
  language: InterfaceLanguage = activeLanguage
): string {
  if (language === "en" || !Object.hasOwn(UI_LABELS, source)) return source;
  const entry = (UI_LABELS as Record<string, Partial<Record<InterfaceLanguage, string>>>)[source];
  const translated = entry?.[language];
  return typeof translated === "string" && translated.trim() ? translated : source;
}

export function getInterfaceLanguageDirection(language: InterfaceLanguage): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

export function useInterfaceLanguage() {
  const language = useSyncExternalStore<InterfaceLanguage>(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => activeLanguage,
    () => "en"
  );
  const t = useCallback((source: string) => translateInterfaceLabel(source, language), [language]);
  const languageFor = useCallback(
    (source: string) => getInterfaceTextLanguage(source, language),
    [language]
  );
  const directionFor = useCallback(
    (source: string) => getInterfaceTextDirection(source, language),
    [language]
  );
  return { language, setLanguage: setInterfaceLanguage, t, languageFor, directionFor };
}
