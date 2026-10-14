import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { applyInitialInterfaceLanguage } from "@/lib/interface-locale";
import { setRegionalPreference } from "@/lib/regional-format";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ logout: vi.fn(), user: { username: "test-user" } }),
}));

describe("AppSidebar translated labels", () => {
  beforeEach(() => {
    localStorage.setItem("questarr.interface-language", "ar");
    applyInitialInterfaceLanguage();
  });

  afterEach(() => {
    act(() => setRegionalPreference("system"));
  });

  it("marks collapsible navigation labels with their translated language and direction", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["/api/games"], []);
    queryClient.setQueryData(["/api/downloads"], { downloads: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    );

    const libraryButton = screen.getByTestId("nav-library");
    const translatedLabel = within(libraryButton).getByText("المكتبة");

    expect(libraryButton).toHaveAttribute("lang", "ar");
    expect(libraryButton).toHaveAttribute("dir", "rtl");
    expect(translatedLabel).toHaveAttribute("lang", "ar");
    expect(translatedLabel).toHaveAttribute("dir", "rtl");
  });

  it("places the desktop sidebar on the right for Arabic and the left for English", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["/api/games"], []);
    queryClient.setQueryData(["/api/downloads"], { downloads: [] });

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    );

    expect(document.querySelector('[data-slot="sidebar"][data-side="right"]')).not.toBeNull();

    unmount();
    localStorage.setItem("questarr.interface-language", "en");
    applyInitialInterfaceLanguage();

    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    );

    expect(document.querySelector('[data-slot="sidebar"][data-side="left"]')).not.toBeNull();
  });

  it("formats navigation badges with the current regional digits", () => {
    act(() => setRegionalPreference("es"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(
      ["/api/games"],
      [{ status: "wanted" }, { status: "wanted" }, { status: "owned" }]
    );
    queryClient.setQueryData(["/api/downloads"], {
      downloads: [{ status: "downloading" }, { status: "downloading" }],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    );

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
      expect.stringContaining(`(${arabicTwo})`)
    );
    expect(screen.getByTestId("nav-downloads")).toHaveAttribute(
      "aria-label",
      expect.stringContaining(`(${arabicTwo})`)
    );
  });
});
