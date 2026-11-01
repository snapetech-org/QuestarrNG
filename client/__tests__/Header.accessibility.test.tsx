/** @vitest-environment jsdom */
import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { serviceMessage } from "@shared/service-messages";
import Header from "../src/components/Header";
import { createTestQueryClient, getRequestUrl } from "./test-utils";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button" aria-label="Toggle Sidebar" />,
}));

vi.mock("../src/components/NotificationCenter", () => ({
  NotificationCenter: () => null,
}));

vi.mock("../src/components/AddGameModal", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <>
      <span data-testid="add-game-modal-loaded" hidden />
      {children}
    </>
  ),
}));

describe("Header accessibility", () => {
  it("keeps typed storage failures distinct from matching raw provider text", async () => {
    const fragment = serviceMessage("service.internal_server_error", {});
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getRequestUrl(input);
      const data = url.includes("/api/downloaders/storage")
        ? [
            {
              downloaderId: "app",
              downloaderName: "App",
              freeSpace: 0,
              error: fragment.message,
              errorI18n: fragment,
            },
            {
              downloaderId: "provider",
              downloaderName: "Provider",
              freeSpace: 0,
              error: fragment.message,
              errorI18n: null,
            },
          ]
        : url.includes("/api/config")
          ? { igdb: { configured: true } }
          : [];
      return { ok: true, json: async () => data } as Response;
    }) as typeof fetch;
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Header />
      </QueryClientProvider>
    );
    const messages = await screen.findAllByText(fragment.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveAttribute("lang", "en");
    expect(messages[1]).toHaveAttribute("lang", "und");
  });

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getRequestUrl(input);
      const data = url.includes("/api/config")
        ? { igdb: { configured: true } }
        : url.includes("/api/auth/me")
          ? { id: "test-user", username: "admin" }
          : [];
      return { ok: true, json: async () => data } as Response;
    }) as typeof fetch;
  });

  it("gives the icon-only Add Game action a descriptive accessible name", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Header />
      </QueryClientProvider>
    );

    await screen.findByTestId("add-game-modal-loaded");
    expect(screen.getByRole("button", { name: "Add Game", exact: true })).toHaveAccessibleName(
      "Add Game"
    );
  });
});
