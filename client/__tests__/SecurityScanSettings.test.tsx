/** @vitest-environment jsdom */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient, getRequestUrl } from "./test-utils";
import { serviceMessage } from "@shared/service-messages";
import SecurityScanSettings from "../src/components/SecurityScanSettings";
import { setInterfaceLanguage } from "../src/lib/interface-locale";

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiRequest: vi.fn(async () => ({ json: async () => ({ success: true }) })),
  };
});

const defaultSettings = {
  virusTotal: { enabled: false, apiKey: "", threshold: 2, blockUnknownHashes: false },
  clamav: { enabled: false, host: "", port: 3310 },
};

function createJsonResponse(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

function mockFetch(settings: unknown = defaultSettings) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
    const u = getRequestUrl(url);
    if (u.includes("/api/settings/security-scan")) return createJsonResponse(settings);
    return createJsonResponse({});
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SecurityScanSettings />
    </QueryClientProvider>
  );
}

describe("SecurityScanSettings", () => {
  it.each([true, false])("keeps provider test error ownership in its toast: %s", async (typed) => {
    const { apiRequest, ApiError } = await import("@/lib/queryClient");
    const fragment = serviceMessage("service.clamav_ping_timeout", {});
    vi.mocked(apiRequest).mockRejectedValueOnce(
      new ApiError(502, fragment.message, {
        error: fragment.message,
        errorI18n: typed ? fragment : null,
      })
    );
    mockFetch({ ...defaultSettings, clamav: { enabled: false, host: "clamav", port: 3310 } });
    renderComponent();
    const buttons = await screen.findAllByRole("button", { name: "Test" });
    await waitFor(() => expect(buttons.at(-1)).not.toBeDisabled());
    fireEvent.click(buttons.at(-1)!);
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const toast = mockToast.mock.calls.at(-1)?.[0];
    const detail = render(<>{toast.description}</>);
    expect(detail.container).toHaveTextContent(fragment.message);
    expect(detail.container.querySelector("bdi")).toHaveAttribute("lang", typed ? "en" : "und");
    detail.unmount();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    act(() => setInterfaceLanguage("en"));
    mockFetch();
  });

  afterEach(() => {
    act(() => setInterfaceLanguage("en"));
    vi.restoreAllMocks();
  });

  it("renders both providers once settings load", async () => {
    renderComponent();
    expect(await screen.findByText("VirusTotal (Hash-Based)")).toBeInTheDocument();
    expect(screen.getByText("Local ClamAV (Deep Scan)")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(screen.getByLabelText("Detection Threshold")).toHaveValue(2);
  });

  it("pre-fills the masked API key placeholder when one is already configured", async () => {
    mockFetch({
      virusTotal: { enabled: true, apiKey: "********", threshold: 2, blockUnknownHashes: false },
      clamav: { enabled: false, host: "", port: 3310 },
    });
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");
    expect(screen.getByLabelText("API Key")).toHaveValue("********");
  });

  it("clears the masked placeholder when the API key field gains focus", async () => {
    mockFetch({
      virusTotal: { enabled: true, apiKey: "********", threshold: 2, blockUnknownHashes: false },
      clamav: { enabled: false, host: "", port: 3310 },
    });
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");

    const input = screen.getByLabelText("API Key");
    fireEvent.focus(input);
    expect(input).toHaveValue("");
  });

  it("saves updated settings via the mutation", async () => {
    const { apiRequest } = await import("@/lib/queryClient");
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");

    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "newkey123" } });
    fireEvent.change(screen.getByLabelText("Detection Threshold"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/settings/security-scan",
        expect.objectContaining({
          virusTotal: expect.objectContaining({ apiKey: "newkey123", threshold: 5 }),
        })
      );
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.any(Object), description: expect.any(Object) })
      );
    });
    const options = mockToast.mock.calls.find(([value]) => value.title)?.[0];
    const { container } = render(
      <>
        {options?.title}
        {options?.description}
      </>
    );
    expect(container).toHaveTextContent("Settings Saved");
    expect(container).toHaveTextContent("Security scan configuration updated.");
  });

  it("tests the VirusTotal provider and shows a success toast", async () => {
    const { apiRequest } = await import("@/lib/queryClient");
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");

    const testButtons = screen.getAllByRole("button", { name: "Test" });
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("POST", "/api/settings/security-scan/test", {
        provider: "virustotal",
      });
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.any(Object), description: expect.any(Object) })
      );
    });
  });

  it("tests the ClamAV provider", async () => {
    const { apiRequest } = await import("@/lib/queryClient");
    renderComponent();
    await screen.findByText("Local ClamAV (Deep Scan)");

    const testButtons = screen.getAllByRole("button", { name: "Test" });
    fireEvent.click(testButtons[1]);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("POST", "/api/settings/security-scan/test", {
        provider: "clamav",
      });
    });
  });

  it("shows an error toast when a provider test fails", async () => {
    const { apiRequest } = await import("@/lib/queryClient");
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("VirusTotal rejected the API key"));
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.any(Object),
          description: expect.any(Object),
          variant: "destructive",
        })
      );
    });
    const options = mockToast.mock.calls.find(([value]) => value.variant === "destructive")?.[0];
    expect(options?.description).toBeTruthy();
    const { container } = render(<>{options?.description}</>);
    expect(container).toHaveTextContent("VirusTotal rejected the API key");
  });

  it("localizes a fixed ClamAV test error and keeps dynamic provider errors unchanged", async () => {
    const { apiRequest } = await import("@/lib/queryClient");
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Connection to ClamAV timed out"));
    renderComponent();
    await screen.findByText("Local ClamAV (Deep Scan)");
    act(() => setInterfaceLanguage("es"));

    fireEvent.click(screen.getAllByRole("button", { name: "Prueba" })[1]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.any(Object), variant: "destructive" })
      );
    });
    const options = mockToast.mock.calls.find(([value]) => value.variant === "destructive")?.[0];
    const { container } = render(<>{options?.description}</>);
    expect(container).toHaveTextContent("Se agotó el tiempo de conexión con ClamAV");
  });

  it("toggles the VirusTotal enable switch", async () => {
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");

    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("aria-checked", "false");
    fireEvent.click(switches[0]);
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
  });

  it("disables the Test buttons once the form has unsaved changes", async () => {
    renderComponent();
    await screen.findByText("VirusTotal (Hash-Based)");

    for (const button of screen.getAllByRole("button", { name: "Test" })) {
      expect(button).not.toBeDisabled();
    }

    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "editing..." } });

    for (const button of screen.getAllByRole("button", { name: "Test" })) {
      expect(button).toBeDisabled();
    }
  });
});
