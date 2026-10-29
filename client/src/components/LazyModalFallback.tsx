import React from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useInterfaceLanguage } from "@/lib/interface-locale";

interface LazyModalFallbackProps {
  message?: string;
}

export default function LazyModalFallback({ message = "Loading..." }: LazyModalFallbackProps) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" data-testid="lazy-modal-fallback">
        <DialogTitle
          className="sr-only"
          lang={languageFor("interface.loading_modal_e1186d4e")}
          dir={directionFor("interface.loading_modal_e1186d4e")}
        >
          {t("interface.loading_modal_e1186d4e")}
        </DialogTitle>
        <DialogDescription
          className="sr-only"
          lang={languageFor("interface.please_wait_while_content_loads_6af7d155")}
          dir={directionFor("interface.please_wait_while_content_loads_6af7d155")}
        >
          {t("interface.please_wait_while_content_loads_6af7d155")}
        </DialogDescription>
        <div
          className="flex h-32 items-center justify-center gap-2"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          <span
            className="text-sm text-muted-foreground"
            lang={languageFor(message)}
            dir={directionFor(message)}
          >
            {t(message)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
