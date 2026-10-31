import { ServiceMessageText } from "./ServiceMessageText";
import { getLocalizedApiErrorDetail } from "@/lib/api-error-locale";
import { getInterfaceLanguageDirection, useInterfaceLanguage } from "@/lib/interface-locale";

/** Localizes known app-owned details while leaving provider and user text untouched. */
export function ApiErrorDetailText({
  source,
  metadata,
  legacyApiFallback = true,
}: {
  source: string;
  metadata?: unknown;
  legacyApiFallback?: boolean;
}) {
  const { language } = useInterfaceLanguage();
  if ((metadata !== null && metadata !== undefined) || !legacyApiFallback)
    return <ServiceMessageText message={source} metadata={metadata} />;
  const translation = getLocalizedApiErrorDetail(source, language);

  if (translation === undefined) {
    return (
      <bdi lang="und" dir="auto">
        {source}
      </bdi>
    );
  }

  return (
    <bdi lang={language} dir={getInterfaceLanguageDirection(language)}>
      {translation}
    </bdi>
  );
}
