// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RssSettings from "@/components/RssSettings";
import type { RssFeed } from "@shared/schema";
import { setInterfaceLanguage } from "@/lib/interface-locale";

const mockState = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({ apiRequest: mockState.apiRequest }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockState.toast }) }));
function makeFeed(overrides: Partial<RssFeed> = {}): RssFeed {
  return {
    id: "feed-1",
    name: "Questarr releases",
    url: "https://example.test/releases.xml",
    type: "custom",
    enabled: true,
    status: "ok",
    errorMessage: null,
    lastFetched: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as RssFeed;
}

function renderSettings(feeds: RssFeed[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["/api/rss/feeds"], feeds);
  return render(
    <QueryClientProvider client={client}>
      <RssSettings />
    </QueryClientProvider>
  );
}

describe("RssSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInterfaceLanguage("en");
    mockState.apiRequest.mockImplementation(async (method: string) => ({
      json: async () => (method === "GET" ? [] : { ok: true }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("guards incomplete feed submissions and resets the form after a successful add", async () => {
    renderSettings([]);
    fireEvent.click(screen.getByRole("button", { name: "Manage Feeds" }));

    expect(screen.getByText("No RSS feeds configured. Add one above!")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(addButton).toBeDisabled();

    addButton.disabled = false;
    fireEvent.click(addButton);
    expect(mockState.apiRequest).not.toHaveBeenCalledWith(
      "POST",
      "/api/rss/feeds",
      expect.anything()
    );

    const name = screen.getByPlaceholderText("e.g. My Custom Feed");
    const url = screen.getByPlaceholderText("https://...");
    fireEvent.change(name, { target: { value: "My feed" } });
    addButton.disabled = false;
    fireEvent.click(addButton);
    expect(mockState.apiRequest).not.toHaveBeenCalledWith(
      "POST",
      "/api/rss/feeds",
      expect.anything()
    );

    fireEvent.change(name, { target: { value: "" } });
    fireEvent.change(url, { target: { value: "https://example.test/feed.xml" } });
    addButton.disabled = false;
    fireEvent.click(addButton);
    expect(mockState.apiRequest).not.toHaveBeenCalledWith(
      "POST",
      "/api/rss/feeds",
      expect.anything()
    );

    fireEvent.change(name, { target: { value: "Custom feed" } });
    mockState.apiRequest.mockImplementation(async (method: string) => ({
      json: async () => (method === "GET" ? [] : { ok: true }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockState.apiRequest).toHaveBeenCalledWith("POST", "/api/rss/feeds", {
        name: "Custom feed",
        url: "https://example.test/feed.xml",
        type: "custom",
        enabled: true,
      });
    });
    expect(name).toHaveValue("");
    expect(url).toHaveValue("");
    expect(mockState.toast).toHaveBeenCalledWith({ description: "Feed added" });
  });

  it("shows feed health and handles toggle, delete, and add failures", async () => {
    const feeds = [
      makeFeed(),
      makeFeed({
        id: "feed-error",
        name: "Broken feed",
        status: "error",
        enabled: false,
        errorMessage: "Connection timed out",
      }),
      makeFeed({
        id: "feed-empty-error",
        name: null as unknown as string,
        status: "error",
        errorMessage: null,
      }),
    ];
    mockState.apiRequest.mockImplementation(async (method: string) => ({
      json: async () => (method === "GET" ? feeds : { ok: true }),
    }));
    renderSettings(feeds);
    fireEvent.click(screen.getByRole("button", { name: "Manage Feeds" }));

    expect(screen.getByText("Questarr releases")).toBeInTheDocument();
    expect(screen.getByTitle("Connection timed out")).toBeInTheDocument();
    expect(screen.getByTitle("Error")).toBeInTheDocument();

    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]!);
    await waitFor(() => {
      expect(mockState.apiRequest).toHaveBeenCalledWith("PUT", "/api/rss/feeds/feed-1", {
        enabled: false,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete feed Questarr releases" }));
    await waitFor(() => {
      expect(mockState.apiRequest).toHaveBeenCalledWith("DELETE", "/api/rss/feeds/feed-1");
    });
    expect(mockState.toast).toHaveBeenCalledWith({ description: "Feed removed" });

    mockState.apiRequest.mockRejectedValueOnce(new Error("server unavailable"));
    fireEvent.change(screen.getByPlaceholderText("e.g. My Custom Feed"), {
      target: { value: "Another feed" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.test/another.xml" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockState.toast).toHaveBeenCalledWith({
        description: "Failed to add feed",
        variant: "destructive",
      });
    });
  });
});
