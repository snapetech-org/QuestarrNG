/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import Library from "../src/components/Library";
import { createTestQueryClient, getRequestUrl } from "./test-utils";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/use-hidden-mutation", () => ({
  useHiddenMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-download-summary", () => ({
  useDownloadSummary: () => ({}),
}));

vi.mock("@/hooks/use-view-controls", () => ({
  useViewControls: () => ({
    viewMode: "grid",
    setViewMode: vi.fn(),
    listDensity: "comfortable",
    setListDensity: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-local-storage-state", () => ({
  useLocalStorageState: <T,>(_key: string, initial: T) => {
    const [value, setValue] = React.useState(initial);
    return [value, setValue] as const;
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const games = [
  { id: "1", title: "Wanted Game", status: "wanted", searchResultsAvailable: true },
  { id: "2", title: "Shelved Game", status: "shelved", searchResultsAvailable: true },
  { id: "3", title: "Owned Game", status: "owned", searchResultsAvailable: true },
];

function mockFetch(userSettings: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = getRequestUrl(input);
    if (url.includes("/api/settings")) {
      return { ok: true, json: async () => userSettings } as Response;
    }
    if (url.includes("/api/games")) {
      return { ok: true, json: async () => games } as Response;
    }
    return { ok: true, json: async () => [] } as Response;
  }) as typeof fetch;
}

describe("Library default filtering settings", () => {
  it("hides shelved games by default when hideShelvedByDefault is true", async () => {
    mockFetch({ hideShelvedByDefault: true, hideOwnedInHasResults: true });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Library />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Wanted Game")).toBeInTheDocument());
    expect(screen.queryByText("Shelved Game")).not.toBeInTheDocument();
    expect(screen.getByText("Owned Game")).toBeInTheDocument();
  });

  it("shows shelved games when hideShelvedByDefault is false", async () => {
    mockFetch({ hideShelvedByDefault: false, hideOwnedInHasResults: true });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Library />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Shelved Game")).toBeInTheDocument());
  });

  it("reveals shelved games again via the filter panel override switch", async () => {
    mockFetch({ hideShelvedByDefault: true, hideOwnedInHasResults: true });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Library />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Wanted Game")).toBeInTheDocument());
    expect(screen.queryByText("Shelved Game")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle filters" }));

    const showShelvedSwitch = await screen.findByRole("switch", { name: "Show shelved games" });
    fireEvent.click(showShelvedSwitch);

    await waitFor(() => expect(screen.getByText("Shelved Game")).toBeInTheDocument());
  });

  it("hides owned games from the Has Results filter by default, and the override reveals them", async () => {
    mockFetch({ hideShelvedByDefault: true, hideOwnedInHasResults: true });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Library />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Owned Game")).toBeInTheDocument());

    fireEvent.click(
      screen.getAllByRole("button", { name: "Show games with search results only" })[0]
    );

    await waitFor(() => expect(screen.queryByText("Owned Game")).not.toBeInTheDocument());
    expect(screen.getByText("Wanted Game")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle filters" }));

    const showOwnedSwitch = await screen.findByRole("switch", {
      name: "Show owned games in search results",
    });
    fireEvent.click(showOwnedSwitch);

    await waitFor(() => expect(screen.getByText("Owned Game")).toBeInTheDocument());
  });
});
