import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportHistoryPage from "@/pages/import-history";
import { setInterfaceLanguage, translateInterfaceLabel } from "@/lib/interface-locale";
import { setRegionalPreference } from "@/lib/regional-format";

vi.mock("@/lib/socket", () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

describe("import-history timestamp and duration context", () => {
  afterEach(() => {
    act(() => {
      setInterfaceLanguage("en");
      setRegionalPreference("system");
    });
  });

  it.each([
    ["zh-Hans", "开始时间", "已启动"],
    ["fr", "Heure de début", "Démarré"],
    ["ar", "وقت البدء", "بدأ"],
    ["en", "Start time", "Started"],
  ] as const)(
    "distinguishes the timestamp from downloader state in %s",
    (language, heading, state) => {
      act(() => setInterfaceLanguage(language));
      const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
      queryClient.setQueryData(
        ["/api/import-tasks"],
        [
          {
            id: "task-1",
            taskType: "file_import",
            triggeredBy: "manual",
            status: "completed",
            startedAt: "2026-10-31T12:00:00Z",
            completedAt: "2026-10-31T12:01:05Z",
            createdAt: "2026-10-31T11:59:00Z",
            addedItems: 1,
            skippedItems: 0,
            failedItems: 0,
          },
        ]
      );
      const view = render(
        <QueryClientProvider client={queryClient}>
          <ImportHistoryPage />
        </QueryClientProvider>
      );
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
      expect(translateInterfaceLabel("interface.started_97b5823e", language)).toBe(state);
      view.unmount();
      queryClient.clear();
    }
  );

  it("uses selected regional digits and units for duration, independently of interface language", () => {
    act(() => {
      setInterfaceLanguage("en");
      setRegionalPreference("ar");
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    queryClient.setQueryData(
      ["/api/import-tasks"],
      [
        {
          id: "task-1",
          taskType: "file_import",
          triggeredBy: "manual",
          status: "completed",
          startedAt: "2026-10-31T12:00:00Z",
          completedAt: "2026-10-31T12:01:05Z",
          createdAt: "2026-10-31T11:59:00Z",
          addedItems: 1,
          skippedItems: 0,
          failedItems: 0,
        },
      ]
    );
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ImportHistoryPage />
      </QueryClientProvider>
    );
    expect(screen.getByRole("columnheader", { name: "Start time" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /^[١1] د [٥5] ث$/ })).toBeInTheDocument();
    act(() => setRegionalPreference("en"));
    expect(screen.getByRole("cell", { name: "1m 5s" })).toBeInTheDocument();
    view.unmount();
    queryClient.clear();
  });
});
