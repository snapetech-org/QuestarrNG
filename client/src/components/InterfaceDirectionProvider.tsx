import type { ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { getInterfaceLanguageDirection, useInterfaceLanguage } from "@/lib/interface-locale";

/** Radix otherwise defaults its controls to LTR, overriding document direction. */
export function InterfaceDirectionProvider({ children }: { children: ReactNode }) {
  const { language } = useInterfaceLanguage();
  return (
    <DirectionProvider dir={getInterfaceLanguageDirection(language)}>{children}</DirectionProvider>
  );
}
