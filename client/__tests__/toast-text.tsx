import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { getInterfaceLanguage, translateInterfaceLabel } from "@/lib/interface-locale";

/** Assert the visible toast text while allowing lazy, language-aware content. */
export function expectToastText(expected: string | { asymmetricMatch(value: unknown): boolean }) {
  return {
    asymmetricMatch(value: unknown) {
      const language = getInterfaceLanguage();
      const content = typeof value === "function" ? value(language, "system") : value;
      if (typeof content === "string")
        return typeof expected === "string"
          ? translateInterfaceLabel(content, language) === expected
          : expected.asymmetricMatch(translateInterfaceLabel(content, language));
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(content as ReactNode);
      return typeof expected === "string"
        ? container.textContent === expected
        : expected.asymmetricMatch(container.textContent);
    },
    toString: () => `RenderedToastText(${expected})`,
  };
}
