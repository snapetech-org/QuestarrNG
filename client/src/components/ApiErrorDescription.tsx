import { ServiceMessageError } from "@shared/service-messages";
import { ApiError, getApiErrorMetadata } from "@/lib/queryClient";
import { getLocalizedApiErrorMessage } from "@/lib/api-error-locale";
import {
  getInterfaceLanguageDirection,
  getInterfaceTextDirection,
  getInterfaceTextLanguage,
  translateInterfaceLabel,
  useInterfaceLanguage,
} from "@/lib/interface-locale";
import { InterfaceText } from "./InterfaceText";
import { ServiceMessageText } from "./ServiceMessageText";

/** Preserve raw/typed API ownership through the toast's automatic text-localization boundary. */
export function ApiErrorDescription({
  error,
  fallbackSource = "interface.unknown_error_ce512b43",
}: {
  error: unknown;
  fallbackSource?: string;
}) {
  const { language } = useInterfaceLanguage();
  if (error instanceof ApiError) {
    const metadata = getApiErrorMetadata(error.data);
    if (metadata.present) {
      const data = error.data as Record<string, unknown>;
      const raw = data.error || data.message;
      return (
        <ServiceMessageText
          message={typeof raw === "string" ? raw : error.message}
          metadata={metadata.value}
        />
      );
    }
    return (
      <bdi lang={language} dir={getInterfaceLanguageDirection(language)}>
        {getLocalizedApiErrorMessage(error.code, error.status, error.rawDetail, language)}
      </bdi>
    );
  }
  if (error instanceof ServiceMessageError)
    return <ServiceMessageText message={error.message} metadata={error} />;
  if (error instanceof Error && error.message)
    return (
      <bdi
        lang={getInterfaceTextLanguage(error.message, language)}
        dir={getInterfaceTextDirection(error.message, language)}
      >
        {translateInterfaceLabel(error.message, language)}
      </bdi>
    );
  return <InterfaceText source={fallbackSource} />;
}
