import { useCallback, useSyncExternalStore } from "react";
import { UI_LABELS } from "./ui-labels";
import { getLocaleDirection } from "./locale-direction";
import {
  STABLE_INTERFACE_MESSAGES,
  type StableInterfaceMessageId,
} from "./stable-interface-messages";

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

export const INTERFACE_LANGUAGE_FALLBACKS = {
  pt: "pt-BR",
  zh: {
    default: "zh-Hans",
    script: { hans: "zh-Hans", hant: "zh-Hant" },
    region: { cn: "zh-Hans", sg: "zh-Hans", tw: "zh-Hant", hk: "zh-Hant", mo: "zh-Hant" },
  },
} as const;

export function resolveInterfaceLanguage(candidate: string): InterfaceLanguage | undefined {
  const normalized = candidate.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) return undefined;
  const subtags = normalized.split("-");
  const base = subtags[0];
  if (base === "zh") {
    const script = subtags.find((subtag) => subtag === "hans" || subtag === "hant");
    if (script === "hans" || script === "hant") {
      return INTERFACE_LANGUAGE_FALLBACKS.zh.script[script];
    }
    const region = subtags.find((subtag) => /^[a-z]{2}$/u.test(subtag));
    if (region && Object.hasOwn(INTERFACE_LANGUAGE_FALLBACKS.zh.region, region)) {
      return INTERFACE_LANGUAGE_FALLBACKS.zh.region[
        region as keyof typeof INTERFACE_LANGUAGE_FALLBACKS.zh.region
      ];
    }
    return INTERFACE_LANGUAGE_FALLBACKS.zh.default;
  }
  if (base === "pt") return INTERFACE_LANGUAGE_FALLBACKS.pt;
  return INTERFACE_LANGUAGE_OPTIONS.find((option) => option.value.toLowerCase() === base)?.value;
}

export function getBrowserInterfaceLanguage(
  browser: Pick<Navigator, "language" | "languages"> | null = typeof navigator === "undefined"
    ? null
    : navigator
): InterfaceLanguage {
  if (!browser) return "en";
  const candidates = browser.languages?.length ? browser.languages : [browser.language];
  for (const candidate of candidates) {
    const resolved = resolveInterfaceLanguage(candidate);
    if (resolved) return resolved;
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

const UI_LABELS_BY_ID = UI_LABELS as Record<
  string,
  Partial<Record<InterfaceLanguage, string>>
>;

const SOURCE_TO_MESSAGE_ID = new Map<string, StableInterfaceMessageId>(
  Object.entries(STABLE_INTERFACE_MESSAGES).map(([id, source]) => [
    source,
    id as StableInterfaceMessageId,
  ])
);

function resolveInterfaceMessageId(reference: string): StableInterfaceMessageId | undefined {
  if (Object.hasOwn(STABLE_INTERFACE_MESSAGES, reference)) {
    return reference as StableInterfaceMessageId;
  }
  return SOURCE_TO_MESSAGE_ID.get(reference);
}

/** Returns true for a stable ID or a recognized legacy English source alias. */
export function hasInterfaceMessage(reference: string): boolean {
  return resolveInterfaceMessageId(reference) !== undefined;
}

export function getInterfaceTextLanguage(
  reference: string,
  language: InterfaceLanguage
): InterfaceLanguage {
  const id = resolveInterfaceMessageId(reference);
  if (language === "en" || !id) return "en";
  const translated = UI_LABELS_BY_ID[id]?.[language];
  return translated && translated !== STABLE_INTERFACE_MESSAGES[id] ? language : "en";
}

export function getInterfaceTextDirection(
  reference: string,
  language: InterfaceLanguage
): "ltr" | "rtl" {
  return getInterfaceLanguageDirection(getInterfaceTextLanguage(reference, language));
}

export function formatInterfaceMessage(
  reference: string,
  values: Record<string, string | number>,
  language: InterfaceLanguage = getInterfaceLanguage()
): string {
  const id = resolveInterfaceMessageId(reference);
  const source = id ? STABLE_INTERFACE_MESSAGES[id] : reference;
  const template = id && language !== "en" ? (UI_LABELS_BY_ID[id]?.[language] ?? source) : source;
  const isolateValues = getInterfaceTextDirection(reference, language) === "rtl";
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) return placeholder;
    return isolateValues ? `\u2068${String(value)}\u2069` : String(value);
  });
}

export type InterfacePluralForms = Readonly<
  Partial<Record<Intl.LDMLPluralRule, StableInterfaceMessageId>>
> & {
  other: StableInterfaceMessageId;
  exact?: Readonly<Record<string, StableInterfaceMessageId>>;
};

export function translateInterfaceMessage(
  id: StableInterfaceMessageId,
  language: InterfaceLanguage = activeLanguage
): string {
  return translateInterfaceLabel(id, language);
}

export function getInterfaceMessageTextLanguage(
  id: StableInterfaceMessageId,
  language: InterfaceLanguage
): InterfaceLanguage {
  return getInterfaceTextLanguage(id, language);
}

export function getInterfaceMessageTextDirection(
  id: StableInterfaceMessageId,
  language: InterfaceLanguage
): "ltr" | "rtl" {
  return getInterfaceLanguageDirection(getInterfaceMessageTextLanguage(id, language));
}

export function formatInterfaceMessageById(
  id: StableInterfaceMessageId,
  values: Record<string, string | number>,
  language: InterfaceLanguage = activeLanguage
): string {
  return formatInterfaceMessage(id, values, language);
}

/** Select a CLDR plural category before interpolating the selected catalog message. */
export function formatInterfacePluralMessage(
  count: number,
  forms: InterfacePluralForms,
  values: Record<string, string | number> = {},
  language: InterfaceLanguage = activeLanguage,
  formattedCount = new Intl.NumberFormat(language).format(count)
): string {
  const exact = forms.exact?.[String(count)];
  const category = new Intl.PluralRules(language).select(count);
  const template = exact ?? forms[category] ?? forms.other;
  return formatInterfaceMessage(template, { ...values, count: formattedCount }, language);
}

/** Select a message branch by a non-numeric value, with a required fallback. */
export function formatInterfaceSelectMessage(
  selection: string,
  forms: Readonly<Record<string, StableInterfaceMessageId>> & {
    other: StableInterfaceMessageId;
  },
  values: Record<string, string | number> = {},
  language: InterfaceLanguage = activeLanguage
): string {
  return formatInterfaceMessage(
    forms[selection] ?? forms.other,
    { ...values, selection },
    language
  );
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
  reference: string,
  language: InterfaceLanguage = activeLanguage
): string {
  const id = resolveInterfaceMessageId(reference);
  if (!id) return reference;
  const source = STABLE_INTERFACE_MESSAGES[id];
  if (language === "en") return source;
  const translated = UI_LABELS_BY_ID[id]?.[language];
  return typeof translated === "string" && translated.trim() ? translated : source;
}

export function getInterfaceLanguageDirection(language: InterfaceLanguage | string): "ltr" | "rtl" {
  return getLocaleDirection(language);
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
  const tId = useCallback(
    (id: StableInterfaceMessageId) => translateInterfaceMessage(id, language),
    [language]
  );
  const languageForId = useCallback(
    (id: StableInterfaceMessageId) => getInterfaceMessageTextLanguage(id, language),
    [language]
  );
  const directionForId = useCallback(
    (id: StableInterfaceMessageId) => getInterfaceMessageTextDirection(id, language),
    [language]
  );
  const languageFor = useCallback(
    (source: string) => getInterfaceTextLanguage(source, language),
    [language]
  );
  const directionFor = useCallback(
    (source: string) => getInterfaceTextDirection(source, language),
    [language]
  );
  return {
    language,
    setLanguage: setInterfaceLanguage,
    t,
    tId,
    languageFor,
    directionFor,
    languageForId,
    directionForId,
  };
}
