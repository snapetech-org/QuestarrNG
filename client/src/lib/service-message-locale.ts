import { isServiceMessageKey, serviceMessage } from "@shared/service-messages";
import {
  formatInterfaceMessage,
  getInterfaceLanguage,
  type InterfaceLanguage,
} from "@/lib/interface-locale";

/** Unknown/provider text has no app-owned metadata and passes through unchanged. */
export function localizeServiceResultMessage(
  result: { message: string; messageKey?: unknown; messageValues?: unknown },
  language: InterfaceLanguage = getInterfaceLanguage()
): string {
  if (language === "en" || !isServiceMessageKey(result.messageKey)) return result.message;
  const values = result.messageValues;
  if (!values || typeof values !== "object" || Array.isArray(values)) return result.message;
  const entries = Object.entries(values);
  if (
    !entries.every(
      ([, value]) =>
        typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
    )
  )
    return result.message;
  const params = Object.fromEntries(entries) as Record<string, string | number>;
  try {
    // Reject mismatched keys/values rather than translating arbitrary provider copy.
    if (serviceMessage(result.messageKey, params).message !== result.message) return result.message;
  } catch {
    return result.message;
  }
  const formatted = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      key === "count" && typeof value === "number"
        ? new Intl.NumberFormat(language).format(value)
        : value,
    ])
  );
  return formatInterfaceMessage(result.messageKey, formatted, language);
}
