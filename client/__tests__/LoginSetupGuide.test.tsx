/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/pages/auth/login";
import { setInterfaceLanguage, translateInterfaceLabel } from "@/lib/interface-locale";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ login: vi.fn(), isLoading: false }) }));
vi.mock("@/components/GitHubVersionLink", () => ({ GitHubVersionLink: () => null }));
vi.mock("@/lib/queryClient", () => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ enabled: true, provider: "generic" }))),
}));

afterEach(() => {
  cleanup();
  act(() => setInterfaceLanguage("en"));
});

describe("OIDC setup-guide accessible label", () => {
  it("retains the current provider label and safe new-tab link across language changes", async () => {
    act(() => setInterfaceLanguage("en"));
    render(<LoginPage />);
    const link = await screen.findByRole("link", {
      name: "identity provider setup guide (opens in a new tab)",
    });
    const url = link.getAttribute("href");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    for (const locale of ["fr", "ar"] as const) {
      act(() => setInterfaceLanguage(locale));
      expect(link).toHaveAttribute(
        "aria-label",
        `${translateInterfaceLabel("identity provider", locale)} setup guide (opens in a new tab)`
      );
      expect(link).toHaveAttribute("href", url);
      expect(link).toHaveAttribute("lang", "en");
      expect(link.firstElementChild).toHaveTextContent(
        translateInterfaceLabel("interface.provider_setup_guide_9f61fa39", locale)
      );
      expect(link.firstElementChild).toHaveAttribute("lang", locale);
    }
  });
});
