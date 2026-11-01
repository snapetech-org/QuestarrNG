import {
  hasServiceMessageTranslation,
  localizeServiceMessage,
  matchingServiceMessageDescriptor,
} from "@shared/service-messages";
import { getInterfaceLanguageDirection, useInterfaceLanguage } from "@/lib/interface-locale";

/** A React value keeps untagged provider/user copy outside automatic toast translation. */
export function ServiceMessageText({ message, metadata }: { message: string; metadata?: unknown }) {
  const { language } = useInterfaceLanguage();
  const descriptor = matchingServiceMessageDescriptor(message, metadata);
  const text = localizeServiceMessage(message, descriptor, language);
  const translated = descriptor && hasServiceMessageTranslation(descriptor, language);
  return (
    <bdi
      lang={translated ? language : descriptor ? "en" : "und"}
      dir={translated ? getInterfaceLanguageDirection(language) : "auto"}
    >
      {text}
    </bdi>
  );
}
