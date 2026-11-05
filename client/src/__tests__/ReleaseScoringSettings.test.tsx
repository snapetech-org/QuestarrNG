// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReleaseScoringSettings from "@/components/ReleaseScoringSettings";
import type { UserSettings } from "@shared/schema";
import { BUILT_IN_RULES, DEFAULT_RELEASE_PROFILE } from "@shared/release-scoring";
import { setInterfaceLanguage } from "@/lib/interface-locale";

const mockState = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
  forceInvalid: false,
  validateSavedReleaseScoringConfig: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({ apiRequest: mockState.apiRequest }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockState.toast }) }));
vi.mock("@shared/release-scoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/release-scoring")>();
  mockState.validateSavedReleaseScoringConfig.mockImplementation((raw: unknown) =>
    mockState.forceInvalid ? false : actual.validateSavedReleaseScoringConfig(raw)
  );
  return {
    ...actual,
    validateSavedReleaseScoringConfig: mockState.validateSavedReleaseScoringConfig,
  };
});

function makeSettings(releaseScoringProfile: string, releaseScoringEnabled = true) {
  return { releaseScoringEnabled, releaseScoringProfile } as UserSettings;
}

function renderSettings(settings?: UserSettings) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReleaseScoringSettings settings={settings} />
    </QueryClientProvider>
  );
}

describe("ReleaseScoringSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInterfaceLanguage("en");
    mockState.forceInvalid = false;
    mockState.apiRequest.mockResolvedValue({ json: async () => ({ ok: true }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("edits a custom profile and saves it while showing the pending state", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-format" });
    renderSettings();

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("No custom formats yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minimum score"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Minimum score"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Minimum torrent seeders"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Minimum torrent seeders"), { target: { value: "25" } });

    const maxSize = screen.getByLabelText("Maximum size (GiB)") as HTMLInputElement;
    fireEvent.change(maxSize, { target: { value: "1.5" } });
    maxSize.type = "text";
    fireEvent.change(maxSize, { target: { value: "not-a-number" } });
    fireEvent.change(maxSize, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Required title terms"), {
      target: { value: " GOG \n\nportable " },
    });
    fireEvent.change(screen.getByLabelText("Ignored title terms"), {
      target: { value: "crackfix\nmultiplayer" },
    });

    const rule = BUILT_IN_RULES.find((candidate) => !candidate.locked)!;
    const rulePoints = document.getElementById(`score-${rule.id}`)!;
    fireEvent.change(rulePoints, { target: { value: "0" } });
    fireEvent.change(rulePoints, { target: { value: "35" } });
    fireEvent.click(document.getElementById(`enable-${rule.id}`)!);
    fireEvent.click(screen.getByRole("switch", { name: "Use this profile" }));

    fireEvent.click(screen.getByRole("button", { name: "Add format" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Portable" } });
    fireEvent.change(document.getElementById("format-score-new-format")!, {
      target: { value: "0" },
    });
    fireEvent.change(document.getElementById("format-score-new-format")!, {
      target: { value: "40" },
    });
    fireEvent.click(document.getElementById("format-enabled-new-format")!);
    fireEvent.click(screen.getByRole("switch", { name: "Hard reject" }));

    const firstValue = screen.getByLabelText("Value");
    fireEvent.change(firstValue, { target: { value: "GOG" } });
    fireEvent.change(screen.getByLabelText("Match"), { target: { value: "regex" } });
    expect(firstValue).toHaveAttribute("placeholder", "e.g. (GOG|DRM-free)");
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "group" } });
    fireEvent.click(document.getElementById("new-format-negate-0")!);
    fireEvent.click(document.getElementById("new-format-required-0")!);

    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    const values = screen.getAllByLabelText("Value");
    fireEvent.change(values[1]!, { target: { value: "portable" } });
    fireEvent.change(screen.getAllByLabelText("Field")[1]!, { target: { value: "uploader" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove condition" })[1]!);

    let resolveRequest: ((response: { json: () => Promise<{ ok: boolean }> }) => void) | undefined;
    mockState.apiRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Release Scoring" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    });
    expect(mockState.apiRequest).toHaveBeenCalledWith("PATCH", "/api/settings", {
      releaseScoringEnabled: true,
      releaseScoringProfile: expect.any(String),
    });

    await act(async () => {
      resolveRequest?.({ json: async () => ({ ok: true }) });
    });
    await waitFor(() => {
      expect(mockState.toast).toHaveBeenCalledWith({
        title: "Release scoring saved",
        description: "Manual and automatic searches will use this profile.",
      });
    });
  });

  it("loads valid saved formats and falls back when the stored format name is blank", async () => {
    vi.stubGlobal("crypto", {});
    const saved = {
      profile: { ...DEFAULT_RELEASE_PROFILE, minScore: 245 },
      formats: [
        {
          id: "saved-one",
          name: "Loaded format",
          specs: [
            { field: "title", mode: "contains", value: "GOG", required: true, negate: true },
            {
              field: "group",
              mode: "exact",
              value: "games",
              required: undefined,
              negate: undefined,
            },
          ],
          score: 25,
          hardReject: false,
          enabled: true,
        },
        {
          id: "saved-empty-name",
          name: "Empty label",
          specs: [{ field: "title", mode: "regex", value: "(GOG|DRM-free)", required: false }],
          score: 5,
          hardReject: true,
          enabled: false,
        },
      ],
    };
    const view = renderSettings(makeSettings(JSON.stringify(saved)));

    await waitFor(() => {
      expect(screen.getByLabelText("Minimum score")).toHaveValue(245);
      expect(document.getElementById("format-name-saved-one")).toHaveValue("Loaded format");
    });
    expect(screen.getByRole("button", { name: "Remove Empty label" })).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("e.g. (GOG|DRM-free)")).toHaveLength(1);

    const secondFormatName = document.getElementById("format-name-saved-empty-name")!;
    fireEvent.change(secondFormatName, {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "Remove Custom format" })).toBeInTheDocument();
    fireEvent.change(secondFormatName, {
      target: { value: "Renamed" },
    });
    fireEvent.change(document.getElementById("format-score-saved-one")!, {
      target: { value: "0" },
    });
    fireEvent.change(document.getElementById("format-score-saved-one")!, {
      target: { value: "15" },
    });
    fireEvent.change(document.getElementById("saved-one-field-1")!, {
      target: { value: "category" },
    });
    fireEvent.click(document.getElementById("saved-one-negate-0")!);
    fireEvent.click(document.getElementById("saved-one-required-0")!);
    fireEvent.click(screen.getByRole("button", { name: "Remove Renamed" }));

    fireEvent.click(screen.getByRole("button", { name: "Add format" }));
    expect(document.querySelectorAll('input[id^="format-name-format-"]')).toHaveLength(1);

    view.unmount();
    const invalidSaved = {
      ...saved,
      formats: [{ ...saved.formats[0]!, name: "" }],
    };
    renderSettings(makeSettings(JSON.stringify(invalidSaved)));
    await waitFor(() => {
      expect(screen.getByLabelText("Minimum score")).toHaveValue(0);
      expect(screen.getByText("No custom formats yet.")).toBeInTheDocument();
    });
  });

  it("shows validation errors for incomplete conditions and reports failed saves", async () => {
    vi.stubGlobal("crypto", undefined);
    renderSettings(makeSettings("not-json", false));
    await waitFor(() => expect(screen.getByText("Off")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save Release Scoring" }));
    await waitFor(() => {
      expect(mockState.toast).toHaveBeenCalledWith({
        title: "Release scoring saved",
        description: "Your profile is saved and scoring remains disabled.",
      });
    });
    mockState.apiRequest.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Add format" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Complete each custom format condition with a valid value before saving."
    );
    const save = screen.getByRole("button", { name: "Save Release Scoring" }) as HTMLButtonElement;
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove New format" }));
    expect(screen.getByText("No custom formats yet.")).toBeInTheDocument();

    const saveAfterRemoval = screen.getByRole("button", { name: "Save Release Scoring" });
    expect(saveAfterRemoval).not.toBeDisabled();
    mockState.forceInvalid = true;
    fireEvent.click(saveAfterRemoval);
    await waitFor(() => {
      expect(mockState.toast).toHaveBeenCalledWith({
        title: "Could not save release scoring",
        description: "Check the scoring profile and custom format conditions before saving.",
        variant: "destructive",
      });
    });
    expect(mockState.apiRequest).not.toHaveBeenCalled();
  });
});
