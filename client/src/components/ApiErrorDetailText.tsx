import { ServiceMessageText } from "./ServiceMessageText";
import { getLocalizedApiErrorDetail } from "@/lib/api-error-locale";
import { getInterfaceLanguageDirection, useInterfaceLanguage } from "@/lib/interface-locale";

/** Localizes known app-owned details while leaving provider and user text untouched. */
export function ApiErrorDetailText({
  source,
  metadata,
  legacyApiFallback = true,
  ownedSource,
}: {
  source: string;
  metadata?: unknown;
  legacyApiFallback?: boolean;
  /** Exact app-authored source supplied by a trusted local producer; null means opaque data. */
  ownedSource?: string | null;
}) {
  const { language } = useInterfaceLanguage();
  const sourceIsOwned = ownedSource === undefined ? legacyApiFallback : ownedSource === source;
  if ((metadata !== null && metadata !== undefined) || !sourceIsOwned)
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
