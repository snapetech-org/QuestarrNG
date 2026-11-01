import { Fragment, type ReactNode } from "react";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

export type InterfaceRichValue =
  | string
  | number
  | { source: string; values?: Record<string, InterfaceRichValue> };

/** Renders a catalog-backed interface string with its actual language metadata. */
export function InterfaceText({
  source,
  values,
  dir,
}: {
  source: string;
  values?: Record<string, string | number> | undefined;
  dir?: "ltr" | "rtl" | "auto";
}) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const text = values ? formatInterfaceMessage(source, values) : t(source);
  // The document already supplies English language and direction metadata. Avoid
  // wrapping every English text node, which fragments text matching and changes
  // existing component markup without adding useful language information.
  if (language === "en") return text;
  return (
    <span lang={languageFor(source)} dir={dir ?? directionFor(source)}>
      {text}
    </span>
  );
}

/** Renders catalog text with each opaque placeholder's own language metadata. */
export function InterfaceRichText({
  source,
  values = {},
}: {
  source: string;
  values?: Record<string, InterfaceRichValue>;
}) {
  const { directionFor, languageFor, t } = useInterfaceLanguage();
  const template = t(source);
  const parts: ReactNode[] = [];
  const pattern = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    const name = match[1];
    parts.push(template.slice(lastIndex, match.index));
    if (!Object.hasOwn(values, name)) {
      parts.push(match[0]);
    } else {
      const value = values[name];
      if (value === undefined) {
        parts.push(match[0]);
      } else if (typeof value === "string" || typeof value === "number") {
        parts.push(
          <bdi dir="auto" lang="und" key={`value-${parts.length}`}>
            {String(value)}
          </bdi>
        );
      } else {
        parts.push(
          <InterfaceRichText
            key={`message-${parts.length}`}
            source={value.source}
            values={value.values}
          />
        );
      }
    }
    lastIndex = match.index + match[0].length;
  }

  parts.push(template.slice(lastIndex));
  return (
    <span lang={languageFor(source)} dir={directionFor(source)}>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </span>
  );
}
