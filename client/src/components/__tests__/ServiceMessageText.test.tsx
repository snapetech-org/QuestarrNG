import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ServiceMessageText } from "../ServiceMessageText";
import { setInterfaceLanguage } from "@/lib/interface-locale";
import { serviceMessage } from "@shared/service-messages";
afterEach(() => {
  cleanup();
  act(() => setInterfaceLanguage("en"));
});
describe("service toast text boundaries", () => {
  it("keeps a provider value that resembles a UI label raw", () => {
    act(() => setInterfaceLanguage("ar"));
    render(<ServiceMessageText message="Settings" />);
    expect(screen.getByText("Settings")).toHaveAttribute("lang", "und");
    expect(screen.getByText("Settings")).toHaveAttribute("dir", "auto");
  });
  it("reacts to interface direction and preserves raw parameters", () => {
    const fragment = serviceMessage("service.connection_failed_at", {
      client: "NZBGet",
      url: "https://host.test/a?b=c",
      error: "Provider: 429 /a/path",
    });
    render(<ServiceMessageText message={fragment.message} metadata={fragment} />);
    expect(screen.getByText(fragment.message)).toHaveAttribute("lang", "en");
    act(() => setInterfaceLanguage("ar"));
    const node = document.querySelector("bdi")!;
    expect(node).toHaveAttribute("lang", "ar");
    expect(node).toHaveAttribute("dir", "rtl");
    expect(node.textContent).toContain("\u2068https://host.test/a?b=c\u2069");
    expect(node.textContent).toContain("Provider: 429 /a/path");
  });
});
