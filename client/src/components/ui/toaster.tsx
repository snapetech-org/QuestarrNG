import { useToast } from "@/hooks/use-toast";
import React from "react";
import { translateInterfaceLabel, useInterfaceLanguage } from "@/lib/interface-locale";
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

  return (
    <ToastProvider label={getNotificationLabel("notification", language)}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const localizedTitle =
          typeof title === "string" ? translateInterfaceLabel(title, language) : title;
        const localizedDescription =
          typeof description === "string"
            ? translateInterfaceLabel(description, language)
            : description;
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
