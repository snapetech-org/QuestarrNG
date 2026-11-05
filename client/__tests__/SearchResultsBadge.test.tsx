/** @vitest-environment jsdom */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, vi, describe, it, expect } from "vitest";
import SearchResultsBadge from "../src/components/SearchResultsBadge";
import { setInterfaceLanguage } from "@/lib/interface-locale";

// Mock Tooltip
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("SearchResultsBadge", () => {
  afterEach(() => act(() => setInterfaceLanguage("en")));

  it("describes German available content with a noun rather than the update action", () => {
    act(() => setInterfaceLanguage("de"));
    render(<SearchResultsBadge visible={false} updatesAvailable />);
    expect(screen.getByRole("status")).toHaveTextContent("Updates");
    expect(screen.getByRole("status")).not.toHaveTextContent("Aktualisieren");
  });
  it.each(["overlay", "inline"] as const)(
    "identifies available updates in the %s layout",
    (variant) => {
      render(<SearchResultsBadge visible={false} updatesAvailable variant={variant} />);
      expect(
        screen.getByRole("status", { name: "Game updates available on indexers" })
      ).toBeTruthy();
      expect(screen.queryByRole("status", { name: "Downloads available on indexers" })).toBeNull();
    }
  );

  it("renders nothing when visible=false", () => {
    const { container } = render(<SearchResultsBadge visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders badge with Search icon when visible=true", () => {
    render(<SearchResultsBadge visible={true} />);
    const badge = screen.getByRole("status", { name: "Downloads available on indexers" });
    expect(badge).toBeTruthy();
  });

  it("overlay variant has absolute class", () => {
    render(<SearchResultsBadge visible={true} variant="overlay" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("absolute");
  });

  it("inline variant does not have absolute class", () => {
    render(<SearchResultsBadge visible={true} variant="inline" />);
    const badge = screen.getByRole("status");
    expect(badge.className).not.toContain("absolute");
  });
});
