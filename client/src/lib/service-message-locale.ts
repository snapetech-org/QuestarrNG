import { localizeServiceMessage } from "@shared/service-messages";
import { getInterfaceLanguage, type InterfaceLanguage } from "@/lib/interface-locale";

/** Unknown/provider text has no app-owned metadata and passes through unchanged. */
export function localizeServiceResultMessage(
  result: {
    message: string;
    messageKey?: unknown;
    messageValues?: unknown;
    messageDetails?: unknown;
  },
  language: InterfaceLanguage = getInterfaceLanguage()
): string {
  return localizeServiceMessage(result.message, result, language);
}
