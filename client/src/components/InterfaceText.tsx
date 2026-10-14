import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

/** Renders a catalog-backed interface string with its actual language metadata. */
export function InterfaceText({
  source,
  values,
}: {
  source: string;
  values?: Record<string, string | number> | undefined;
}) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const text = values ? formatInterfaceMessage(source, values) : t(source);
  // The document already supplies English language and direction metadata. Avoid
  // wrapping every English text node, which fragments text matching and changes
  // existing component markup without adding useful language information.
  if (language === "en") return text;
  return (
    <span lang={languageFor(source)} dir={directionFor(source)}>
      {text}
    </span>
  );
}
