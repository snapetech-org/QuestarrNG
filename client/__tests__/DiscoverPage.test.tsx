/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DiscoverPage from "../src/pages/discover";
import { createTestQueryClient, getRequestUrl } from "./test-utils";
import { apiRequest } from "@/lib/queryClient";

const carouselRenderLog = vi.hoisted(
  () =>
    [] as Array<{
      title: string;
      queryKey: unknown[];
      queryFn: unknown;
      onStatusChange: unknown;
      onViewDetails: unknown;
      onTrackGame: unknown;
      onToggleHidden: unknown;
    }>
);
const mockHiddenMutate = vi.hoisted(() => vi.fn());

const stableToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: stableToast }),
}));

vi.mock("@/hooks/use-hidden-mutation", () => ({
  useHiddenMutation: () => ({ mutate: mockHiddenMutate }),
}));

// Initial values for useLocalStorageState, by key, overriding the page defaults.
const storedValues: Record<string, unknown> = {};

vi.mock("@/hooks/use-local-storage-state", () => ({
  useLocalStorageState: <T,>(key: string, initial: T) => {
    const [value, setValue] = React.useState<T>(
      key in storedValues ? (storedValues[key] as T) : initial
    );
    return [value, setValue] as const;
  },
}));

vi.mock("@/components/DiscoverSettingsModal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="discover-settings-modal" /> : null,
}));

vi.mock("@/components/GameCarouselSection", () => ({
  default: React.memo(
    ({
      title,
      queryKey,
      queryFn,
      onStatusChange,
      onViewDetails,
      onTrackGame,
      onToggleHidden,
    }: {
      title: string;
      queryKey: unknown[];
      queryFn: unknown;
      onStatusChange: unknown;
      onViewDetails: unknown;
      onTrackGame: unknown;
      onToggleHidden: unknown;
    }) => {
      carouselRenderLog.push({
        title,
        queryKey,
        queryFn,
        onStatusChange,
        onViewDetails,
        onTrackGame,
        onToggleHidden,
      });
      return (
        <div data-testid="carousel-section" data-query-key={JSON.stringify(queryKey)}>
          {title}
        </div>
      );
    }
  ),
}));
vi.mock("@/components/RssFeedList", () => ({
  default: () => <div data-testid="rss-feed-list" />,
}));

vi.mock("@/components/RssSettings", () => ({
  default: () => <div data-testid="rss-settings" />,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn().mockResolvedValue({ json: async () => ({ configured: false }) }),
  queryClient: { cancelQueries: vi.fn(), invalidateQueries: vi.fn() },
}));

vi.mock("@/lib/discover-hidden-mutation", () => ({
  hideDiscoveryGame: vi.fn(),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button role="tab" data-value={value}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

describe("DiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    carouselRenderLog.length = 0;
    for (const key of Object.keys(storedValues)) delete storedValues[key];
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ igdb: { configured: true } }),
    })) as typeof fetch;
  });

  it("renders the Discover heading and handles games with varying status and nullable igdbId", async () => {
    const games = [
      { id: "1", igdbId: 1, hidden: true, status: "wanted" },
      { id: "2", igdbId: 2, hidden: false, status: "owned" },
      { id: "3", igdbId: 3, hidden: false, status: "completed" },
      { id: "4", igdbId: 4, hidden: false, status: "downloading" },
      { id: "5", igdbId: 5, hidden: false, status: "wanted" },
      { id: "6", igdbId: null, hidden: false, status: "wanted" }, // covers the !g.igdbId branch
    ];
    // Override the mock temporarily for this test to hit all logic branches
    vi.mocked(apiRequest).mockImplementation((method: string, url: string) => {
      // Specifically mock the includeHidden=true route again
      if (url.includes("/api/games?includeHidden=true")) {
        return Promise.resolve({ json: async () => games } as Response);
      }
      return Promise.resolve({ json: async () => ({ configured: true }) } as Response);
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DiscoverPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Discover")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discovery settings" })).toBeInTheDocument();

    // Give some time for queries to settle to hit coverage on our new hook
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("preserves IGDB ID 0 in the owned-game discovery filter", async () => {
    storedValues.discoverHideOwned = true;
    const localGames = [{ id: "owned-zero", igdbId: 0, hidden: false, status: "owned" }];
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ igdb: { configured: true } }),
    })) as typeof fetch;
    vi.mocked(apiRequest).mockImplementation((_method: string, url: string) =>
      Promise.resolve({
        json: async () => (url.includes("includeHidden=true") ? localGames : []),
      } as Response)
    );

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DiscoverPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Discover")).toBeInTheDocument();
    await waitFor(() => {
      const popular = carouselRenderLog.filter((entry) => entry.title === "Popular Games").at(-1);
      expect(popular?.queryKey).toContain("0");
    });
  });

  it("snaps the platform select to a listed platform when the setting excludes PC", async () => {
    const platforms = [
      { id: 130, name: "Nintendo Switch" },
      { id: 167, name: "PlayStation 5" },
    ];
    // `/api/config`, `/api/settings` and `/api/games` use the query client's
    // default fetch-based queryFn, while `/api/igdb/platforms` calls apiRequest.
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = getRequestUrl(url);
      if (u.includes("/api/settings")) {
        // Only Switch is selected, so the default "PC" is not on offer.
        return { ok: true, json: async () => ({ importPlatformIds: [130] }) } as Response;
      }
      if (u.includes("/api/games")) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: true, json: async () => ({ igdb: { configured: true } }) } as Response;
    }) as typeof fetch;
    vi.mocked(apiRequest).mockImplementation((_method: string, url: string) => {
      if (url.includes("/api/igdb/platforms")) {
        return Promise.resolve({ json: async () => platforms } as Response);
      }
      return Promise.resolve({ json: async () => [] } as Response);
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DiscoverPage />
      </QueryClientProvider>
    );

    await screen.findByText("Discover");

    // The dropdown offers only the selected platform. Asserting on the carousel
    // title (not just the <select>) is what catches the selection staying on
    // "PC": a DOM only coerces the displayed value, but the carousel is driven
    // by React state and keeps browsing the excluded platform.
    expect(await screen.findByRole("option", { name: "Nintendo Switch" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "PC" })).not.toBeInTheDocument();
    // Several carousels render; assert the By Platform one, which is driven by
    // React state and is what keeps browsing the excluded platform.
    await waitFor(() =>
      expect(screen.getAllByTestId("carousel-section").map((el) => el.textContent)).toContain(
        "Nintendo Switch Games"
      )
    );
    expect(screen.getAllByTestId("carousel-section").map((el) => el.textContent)).not.toContain(
      "PC Games"
    );
  });

  it("keeps unrelated carousel props stable when the genre selection changes", async () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const requestUrl = getRequestUrl(url);
      if (requestUrl.includes("/api/config")) {
        return { ok: true, json: async () => ({ igdb: { configured: true } }) } as Response;
      }
      if (requestUrl.includes("/api/games")) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;
    vi.mocked(apiRequest).mockImplementation(async (_method: string, url: string) => {
      if (url === "/api/igdb/genres") {
        return {
          json: async () => [
            { id: 1, name: "Action" },
            { id: 2, name: "Adventure" },
          ],
        } as Response;
      }
      if (url === "/api/igdb/platforms") {
        return { json: async () => [{ id: 6, name: "PC" }] } as Response;
      }
      return { json: async () => [] } as Response;
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DiscoverPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Adventure Games")).toBeInTheDocument();
    await waitFor(() => {
      expect(queryClient.getQueryData(["/api/games", "", true])).toEqual([]);
      expect(queryClient.getQueryData(["/api/igdb/genres"])).toEqual([
        { id: 1, name: "Action" },
        { id: 2, name: "Adventure" },
      ]);
      expect(queryClient.getQueryData(["/api/igdb/platforms"])).toEqual([{ id: 6, name: "PC" }]);
    });
    await waitFor(() => {
      expect(carouselRenderLog.some(({ title }) => title === "Popular Games")).toBe(true);
    });
    const initialPopularRenders = carouselRenderLog.filter(
      ({ title }) => title === "Popular Games"
    );
    const initialPopularKey = initialPopularRenders.at(-1)?.queryKey;
    const initialGenreKey = carouselRenderLog
      .filter(({ title }) => title === "Adventure Games")
      .at(-1)?.queryKey;

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "Action" } });

    expect(screen.getByText("Adventure Games")).toBeInTheDocument();
    expect(screen.queryByText("Action Games")).not.toBeInTheDocument();
    expect(await screen.findByText("Action Games")).toBeInTheDocument();
    const actionQueryKey = () =>
      carouselRenderLog.filter(({ title }) => title === "Action Games").at(-1)?.queryKey;
    expect(actionQueryKey()).not.toBe(initialGenreKey);
    const latestPopular = carouselRenderLog
      .filter(({ title }) => title === "Popular Games")
      .at(-1)!;
    expect({
      queryKey: latestPopular.queryKey === initialPopularRenders.at(-1)?.queryKey,
      queryFn: latestPopular.queryFn === initialPopularRenders.at(-1)?.queryFn,
      onStatusChange: latestPopular.onStatusChange === initialPopularRenders.at(-1)?.onStatusChange,
      onViewDetails: latestPopular.onViewDetails === initialPopularRenders.at(-1)?.onViewDetails,
      onTrackGame: latestPopular.onTrackGame === initialPopularRenders.at(-1)?.onTrackGame,
      onToggleHidden: latestPopular.onToggleHidden === initialPopularRenders.at(-1)?.onToggleHidden,
    }).toEqual({
      queryKey: true,
      queryFn: true,
      onStatusChange: true,
      onViewDetails: true,
      onTrackGame: true,
      onToggleHidden: true,
    });
    expect(carouselRenderLog.filter(({ title }) => title === "Popular Games")).toHaveLength(
      initialPopularRenders.length
    );
    expect(
      carouselRenderLog.filter(({ title }) => title === "Popular Games").at(-1)?.queryKey
    ).toBe(initialPopularKey);

    expect(actionQueryKey()?.[1]).toBe("Action");
    expect(carouselRenderLog.filter(({ title }) => title === "Popular Games")).toHaveLength(
      initialPopularRenders.length
    );
  });

  it("renders when fetching fails", async () => {
    vi.mocked(apiRequest).mockImplementation((method: string, url: string) => {
      return Promise.reject(new Error("Network Error"));
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DiscoverPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Discover")).toBeInTheDocument();
  });

  it("refreshes its library list when game queries are invalidated", async () => {
    vi.mocked(apiRequest).mockImplementation((_method: string, url: string) => {
      if (url.includes("/api/games?includeHidden=true")) {
        return Promise.resolve({ json: async () => [] } as Response);
      }
      return Promise.resolve({ json: async () => ({ configured: true }) } as Response);
    });
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DiscoverPage />
      </QueryClientProvider>
    );
    const libraryFetches = () =>
      vi.mocked(apiRequest).mock.calls.filter(([, url]) => url === "/api/games?includeHidden=true")
        .length;

    await waitFor(() => expect(libraryFetches()).toBe(1));
    // Every game mutation (hide, status change, add) invalidates ["/api/games"].
    await queryClient.invalidateQueries({ queryKey: ["/api/games"] });
    await waitFor(() => expect(libraryFetches()).toBe(2));
  });

  it("re-keys the carousels when a game becomes wanted while wanted games are hidden", async () => {
    storedValues.discoverHideWanted = true;
    let library: unknown[] = [];
    vi.mocked(apiRequest).mockImplementation((_method: string, url: string) => {
      if (url.includes("/api/games?includeHidden=true")) {
        return Promise.resolve({ json: async () => library } as Response);
      }
      return Promise.resolve({ json: async () => ({ configured: true }) } as Response);
    });
    const queryClient = createTestQueryClient();
    try {
      render(
        <QueryClientProvider client={queryClient}>
          <DiscoverPage />
        </QueryClientProvider>
      );
      const popularKey = async () =>
        (await screen.findByText("Popular Games")).getAttribute("data-query-key");

      await waitFor(async () =>
        expect(await popularKey()).toBe('["/api/igdb/popular","","owned-shown",""]')
      );
      // Rating or tracking a Discover game adds it to the library as wanted.
      library = [{ id: "a", igdbId: 7, hidden: false, status: "wanted" }];
      await queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      await waitFor(async () =>
        expect(await popularKey()).toBe('["/api/igdb/popular","","owned-shown","7"]')
      );
      // A different game takes its place: same count, different members.
      library = [{ id: "b", igdbId: 8, hidden: false, status: "wanted" }];
      await queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      await waitFor(async () =>
        expect(await popularKey()).toBe('["/api/igdb/popular","","owned-shown","8"]')
      );
    } finally {
      delete storedValues.discoverHideWanted;
    }
  });
});
