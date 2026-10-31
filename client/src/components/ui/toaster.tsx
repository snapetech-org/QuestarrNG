import { useToast } from "@/hooks/use-toast";
import React from "react";
import { useInterfaceLanguage } from "@/lib/interface-locale";
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
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
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
