import { getInterfaceLanguageDirection, useInterfaceLanguage } from "@/lib/interface-locale";

export function LocalizedCodeList({ values }: { values: readonly string[] }) {
  const { language } = useInterfaceLanguage();
  const parts = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).formatToParts(
    values
  );
  return (
    <span lang={language} dir={getInterfaceLanguageDirection(language)}>
      {parts.map((part) =>
        part.type === "element" ? (
          <bdi key={part.value} lang="und" dir="ltr" translate="no">
            <code>{part.value}</code>
          </bdi>
        ) : (
          part.value
        )
      )}
    </span>
  );
}
