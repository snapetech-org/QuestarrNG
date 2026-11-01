import { ServiceMessageError } from "@shared/service-messages";
import { ApiError, getApiErrorMetadata } from "@/lib/queryClient";
import { InterfaceText } from "./InterfaceText";
import { ServiceMessageText } from "./ServiceMessageText";

/** Preserve raw/typed API ownership through the toast's automatic text-localization boundary. */
export function ApiErrorDescription({
  error,
  fallbackSource,
}: {
  error: unknown;
  fallbackSource: string;
}) {
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
  }
  if (error instanceof ServiceMessageError)
    return <ServiceMessageText message={error.message} metadata={error} />;
  if (error instanceof Error && error.message)
    return (
      <bdi lang="und" dir="auto">
        {error.message}
      </bdi>
    );
  return <InterfaceText source={fallbackSource} />;
}
