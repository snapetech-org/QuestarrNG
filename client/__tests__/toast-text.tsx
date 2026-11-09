import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { getInterfaceLanguage, translateInterfaceLabel } from "@/lib/interface-locale";

/** Assert the visible toast text while allowing lazy, language-aware content. */
export function expectToastText(expected: string) {
  return {
    asymmetricMatch(value: unknown) {
      const language = getInterfaceLanguage();
      const content = typeof value === "function" ? value(language, "auto") : value;
      if (typeof content === "string")
        return translateInterfaceLabel(content, language) === expected;
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(content as ReactNode);
      return container.textContent === expected;
    },
    toString: () => `RenderedToastText(${expected})`,
  };
}
