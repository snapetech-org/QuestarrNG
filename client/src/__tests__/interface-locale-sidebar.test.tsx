import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { applyInitialInterfaceLanguage } from "@/lib/interface-locale";
import { setRegionalPreference } from "@/lib/regional-format";

const mockVersionService = vi.hoisted(() => ({
  fetchLatestQuestarrVersion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ logout: vi.fn(), user: { username: "test-user" } }),
}));

vi.mock("@/lib/versionService", () => mockVersionService);

function createSidebarQueryClient(
  games: Array<{ status?: string }> = [],
  downloads: Array<{ status?: string }> = []
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: ({ queryKey }) => {
          throw new Error(`Unexpected sidebar query in test: ${queryKey.join("/")}`);
        },
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  queryClient.setQueryData(["/api/config"], { igdb: { configured: false } });
  queryClient.setQueryData(["/api/games"], games);
  queryClient.setQueryData(["/api/downloads"], { downloads });
  queryClient.setQueryData(["latestQuestarrVersion"], null);
  return queryClient;
}

function renderSidebar(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

describe("AppSidebar translated labels", () => {
  beforeEach(() => {
    localStorage.setItem("questarr.interface-language", "ar");
    applyInitialInterfaceLanguage();
  });

  afterEach(() => {
    act(() => setRegionalPreference("system"));
  });

  it("marks collapsible navigation labels with their translated language and direction", () => {
    const queryClient = createSidebarQueryClient();
    renderSidebar(queryClient);
    expect(mockVersionService.fetchLatestQuestarrVersion).not.toHaveBeenCalled();

    const libraryButton = screen.getByTestId("nav-library");
    const translatedLabel = within(libraryButton).getByText("المكتبة");

    expect(libraryButton).toHaveAttribute("lang", "ar");
    expect(libraryButton).toHaveAttribute("dir", "rtl");
    expect(translatedLabel).toHaveAttribute("lang", "ar");
    expect(translatedLabel).toHaveAttribute("dir", "rtl");

    const libraryImport = screen.getByText("استيراد المكتبة");
    expect(libraryImport).toHaveAttribute("lang", "ar");
    expect(libraryImport).toHaveAttribute("dir", "rtl");
  });

  it("places the desktop sidebar on the right for Arabic and the left for English", () => {
    const queryClient = createSidebarQueryClient();
    const { unmount } = renderSidebar(queryClient);

    expect(document.querySelector('[data-slot="sidebar"][data-side="right"]')).not.toBeNull();

    unmount();
    localStorage.setItem("questarr.interface-language", "en");
    applyInitialInterfaceLanguage();

    renderSidebar(queryClient);

    expect(document.querySelector('[data-slot="sidebar"][data-side="left"]')).not.toBeNull();
  });

  it("formats navigation badges with the current regional digits", () => {
    act(() => setRegionalPreference("es"));
    const queryClient = createSidebarQueryClient(
      [{ status: "wanted" }, { status: "wanted" }, { status: "owned" }],
      [{ status: "downloading" }, { status: "downloading" }]
    );
    renderSidebar(queryClient);

    fireEvent.click(screen.getByTestId("nav-more"));
    const wishlistButton = screen.getByTestId("nav-wishlist");
    const downloadsButton = screen.getByTestId("nav-downloads");
    expect(within(wishlistButton).getByText("2", { exact: true })).toBeInTheDocument();
    expect(within(downloadsButton).getByText("2", { exact: true })).toBeInTheDocument();

    act(() => setRegionalPreference("ar"));

    const arabicTwo = new Intl.NumberFormat("ar").format(2);
    expect(within(screen.getByTestId("nav-wishlist")).getByText(arabicTwo)).toBeInTheDocument();
    expect(within(screen.getByTestId("nav-downloads")).getByText(arabicTwo)).toBeInTheDocument();
    expect(screen.getByTestId("nav-wishlist")).toHaveAttribute(
      "aria-label",
      expect.stringContaining(arabicTwo)
    );
    expect(screen.getByTestId("nav-downloads")).toHaveAttribute(
      "aria-label",
      expect.stringContaining(arabicTwo)
    );
  });
});
