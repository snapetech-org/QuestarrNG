const rightToLeftScripts = new Set([
  "Adlm",
  "Arab",
  "Hebr",
  "Mand",
  "Mend",
  "Nkoo",
  "Rohg",
  "Samr",
  "Syrc",
  "Thaa",
  "Yezi",
]);

const rightToLeftLanguages = new Set(["ar", "ckb", "fa", "he", "ks", "ps", "sd", "ug", "ur", "yi"]);

/** Resolve writing direction from BCP 47 language and script metadata. */
export function getLocaleDirection(locale: string): "ltr" | "rtl" {
  const normalizedLocale = locale.replaceAll("_", "-");
  try {
    if (rightToLeftScripts.has(new Intl.Locale(normalizedLocale).maximize().script ?? "")) {
      return "rtl";
    }
  } catch {
    // Fall back to the language subtag for older runtimes or malformed locale tags.
  }

  return rightToLeftLanguages.has(normalizedLocale.split("-")[0]?.toLowerCase() ?? "")
    ? "rtl"
    : "ltr";
}
