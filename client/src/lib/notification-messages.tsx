import type { ReactNode } from "react";
import type { InterfaceLanguage } from "@/lib/interface-locale";
import {
  getNotificationCatalogIndex,
  getNotificationTextDirection,
} from "@shared/notification-locale";
import { MESSAGES, matchNotification, type MessageParams } from "@shared/notification-messages";

export interface LocalizedNotificationMessage {
  content: ReactNode;
  language: InterfaceLanguage;
  direction: "ltr" | "rtl" | "auto";
}
function formatTemplate(
  template: string,
  params: MessageParams,
  language: InterfaceLanguage
): ReactNode {
  return template.split(/(\{[a-z]+\})/g).map((part, index) => {
    const name = part.match(/^\{([a-z]+)\}$/)?.[1];
    if (!name || params[name] === undefined) return part;
    const isUnknownError = name === "error" && params[name] === "unknown error";
    const value = isUnknownError
      ? (MESSAGES.unknownError[getNotificationCatalogIndex(language)] ?? params[name])
      : params[name];
    const isRawEnglish = (name === "error" || name === "reason") && !isUnknownError;
    return (
      <bdi key={`${name}-${index}`} {...(isRawEnglish ? { lang: "en" } : {})} dir="auto">
        {name === "count" ? new Intl.NumberFormat(language).format(Number(params[name])) : value}
      </bdi>
    );
  });
}
export function localizeNotificationMessage(
  title: string,
  message: string,
  language: InterfaceLanguage
): LocalizedNotificationMessage {
  if (language !== "en") {
    const match = matchNotification(title, message);
    if (match) {
      const template = MESSAGES[match.key][getNotificationCatalogIndex(language)];
      if (template) {
        return {
          content: formatTemplate(template, match.params, language),
          language,
          direction: getNotificationTextDirection(language),
        };
      }
    }
  }
  return { content: message, language: "en", direction: "auto" };
}
