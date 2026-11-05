import {
  hasServiceMessageTranslation,
  localizeServiceMessage,
  matchingServiceMessageDescriptor,
} from "@shared/service-messages";
import type { ReactNode } from "react";
import type { InterfaceLanguage } from "@/lib/interface-locale";
import {
  getNotificationCatalogIndex,
  getNotificationTextDirection,
} from "@shared/notification-locale";
import {
  ENGLISH_MESSAGE_TEMPLATES,
  MESSAGES,
  matchNotification,
  type MessageParams,
} from "@shared/notification-messages";

export interface LocalizedNotificationMessage {
  content: ReactNode;
  language: InterfaceLanguage | "und";
  direction: "ltr" | "rtl" | "auto";
}
function formatTemplate(
  template: string,
  params: MessageParams,
  language: InterfaceLanguage,
  templateLanguage: InterfaceLanguage
): ReactNode {
  return template.split(/(\{[a-z]+\})/g).map((part, index) => {
    const name = part.match(/^\{([a-z]+)\}$/)?.[1];
    if (!name || params[name] === undefined) return part;
    const isUnknownError = name === "error" && params[name] === "unknown error";
    const value =
      isUnknownError && templateLanguage !== "en"
        ? (MESSAGES.unknownError[getNotificationCatalogIndex(templateLanguage)] ?? params[name])
        : params[name];
    return (
      <bdi
        key={`${name}-${index}`}
        lang={
          name === "count" ? language : isUnknownError ? templateLanguage : "und"
        }
        dir="auto"
      >
        {name === "count"
          ? language === "en"
            ? String(params[name])
            : new Intl.NumberFormat(language).format(Number(params[name]))
          : value}
      </bdi>
    );
  });
}
export function localizeNotificationMessage(
  title: string,
  message: string,
  language: InterfaceLanguage,
  metadata?: unknown
): LocalizedNotificationMessage {
  if (metadata !== null && metadata !== undefined) {
    const descriptor = matchingServiceMessageDescriptor(message, metadata);
    const text = localizeServiceMessage(message, descriptor, language);
    const translated = descriptor && hasServiceMessageTranslation(descriptor, language);
    return {
      content: text,
      language: translated ? language : descriptor ? "en" : "und",
      direction: translated ? getNotificationTextDirection(language) : "auto",
    };
  }
  const match = matchNotification(title, message);
  if (match) {
    const translatedTemplate = MESSAGES[match.key][getNotificationCatalogIndex(language)];
    const hasTranslation =
      typeof translatedTemplate === "string" &&
      translatedTemplate.trim().length > 0 &&
      translatedTemplate !== ENGLISH_MESSAGE_TEMPLATES[match.key];
    const templateLanguage = hasTranslation ? language : "en";
    return {
      content: formatTemplate(
        hasTranslation ? translatedTemplate : ENGLISH_MESSAGE_TEMPLATES[match.key],
        match.params,
        language,
        templateLanguage
      ),
      language: templateLanguage,
      direction: hasTranslation ? getNotificationTextDirection(language) : "auto",
    };
  }
  return {
    content: <bdi lang="und" dir="auto">{message}</bdi>,
    language: "und",
    direction: "auto",
  };
}
