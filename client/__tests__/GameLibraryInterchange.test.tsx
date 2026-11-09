/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { GameLibraryInterchange } from "@/components/GameLibraryInterchange";
import { createTestQueryClient } from "./test-utils";
const { request, toast } = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: request }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const catalog = { format: "questarrng-library", version: 1, games: [{ title: "Portable Game" }] };
function file() {
  const value = new File([JSON.stringify(catalog)], "library.json", { type: "application/json" });
  Object.defineProperty(value, "text", { value: async () => JSON.stringify(catalog) });
  return value;
}
function show() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <GameLibraryInterchange />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  request.mockReset();
  toast.mockReset();
});
describe("library interchange confirmation", () => {
  it("previews a catalog before importing and clears the confirmation after success", async () => {
    request
      .mockResolvedValueOnce(
        Response.json({
          totalCount: 1,
          addCount: 1,
          duplicateCount: 0,
          addTitles: ["Portable Game"],
          duplicateTitles: [],
        })
      )
      .mockResolvedValueOnce(Response.json({ addedCount: 1, skippedCount: 0, errorCount: 0 }));
    show();
    fireEvent.change(screen.getByLabelText("Import a QuestarrNG library JSON file"), {
      target: { files: [file()] },
    });
    const confirm = await screen.findByRole("button", { name: "Import new games" });
    expect(request).toHaveBeenCalledExactlyOnceWith("POST", "/api/games/import/preview", catalog);
    fireEvent.click(confirm);
    await waitFor(() => expect(request).toHaveBeenCalledWith("POST", "/api/games/import", catalog));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Import new games" })).not.toBeInTheDocument()
    );
  });
  it("disables import when preview finds only duplicates", async () => {
    request.mockResolvedValue(
      Response.json({
        totalCount: 1,
        addCount: 0,
        duplicateCount: 1,
        addTitles: [],
        duplicateTitles: ["Portable Game"],
      })
    );
    show();
    fireEvent.change(screen.getByLabelText("Import a QuestarrNG library JSON file"), {
      target: { files: [file()] },
    });
    expect(await screen.findByRole("button", { name: "Import new games" })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects an oversized file before uploading it", async () => {
    const oversized = file();
    Object.defineProperty(oversized, "size", { value: 4 * 1024 * 1024 + 1 });
    show();
    fireEvent.change(screen.getByLabelText("Import a QuestarrNG library JSON file"), {
      target: { files: [oversized] },
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Catalog is too large" }))
    );
    expect(request).not.toHaveBeenCalled();
  });
});
