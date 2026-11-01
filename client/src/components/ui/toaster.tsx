import { useToast, type ToastContent } from "@/hooks/use-toast";
import React from "react";
import { translateInterfaceLabel, useInterfaceLanguage } from "@/lib/interface-locale";
import { useRegionalPreference } from "@/lib/regional-format";
import { getNotificationLabel } from "@/lib/notification-locale";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  const { language, tId } = useInterfaceLanguage();
  const regionalPreference = useRegionalPreference();
  const resolveContent = (content: ToastContent | undefined) => {
    if (typeof content === "function") return content(language, regionalPreference);
    if (typeof content === "string") return translateInterfaceLabel(content, language);
    return content;
  };

  return (
    <ToastProvider label={getNotificationLabel("notification", language)}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const localizedTitle = resolveContent(title);
        const localizedDescription = resolveContent(description);
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {localizedTitle && <ToastTitle>{localizedTitle}</ToastTitle>}
              {localizedDescription && <ToastDescription>{localizedDescription}</ToastDescription>}
            </div>
            {action}
            <ToastClose aria-label={tId("interface.dismiss_265915f3")} />
          </Toast>
        );
      })}
      <ToastViewport label={`${getNotificationLabel("Notifications", language)} ({hotkey})`} />
    </ToastProvider>
  );
}
