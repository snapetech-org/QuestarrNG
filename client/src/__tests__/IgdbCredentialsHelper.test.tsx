// @vitest-environment jsdom
import { serviceMessage } from "@shared/service-messages";
import { setInterfaceLanguage } from "@/lib/interface-locale";
import React from "react";
import "@testing-library/jest-dom";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { IgdbHelpPopover, IgdbTestConnectionButton } from "../components/IgdbCredentialsHelper";
import * as queryClientLib from "@/lib/queryClient";

vi.mock("@/lib/queryClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));

describe("IgdbHelpPopover", () => {
  it("opens the popover and copies the redirect URI to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<IgdbHelpPopover />);

    fireEvent.click(screen.getByRole("button", { name: "How to get credentials" }));
    await waitFor(() => {
      expect(screen.getByText("How to get IGDB credentials:")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy redirect URI" }));

    expect(writeText).toHaveBeenCalledWith("http://localhost");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy redirect URI" })).toHaveTextContent("Copied");
    });
  });

  it("explains why Questarr can't ship a working credential out of the box", async () => {
    render(<IgdbHelpPopover />);
    fireEvent.click(screen.getByRole("button", { name: "How to get credentials" }));

    await waitFor(() => {
      expect(screen.getByText(/Twitch requires every/i)).toBeInTheDocument();
    });
  });
});

describe("IgdbTestConnectionButton", () => {
  it.each(["valid", "null", "mismatch"] as const)(
    "preserves inline API metadata ownership: %s",
    async (kind) => {
      const fragment = serviceMessage("service.connection_failed", {
        client: "IGDB",
        error: "Provider العربية: /user/{error}",
      });
      const metadata =
        kind === "valid"
          ? fragment
          : kind === "null"
            ? null
            : { ...fragment, messageValues: { client: "Different", error: "provider" } };
      const apiError = new queryClientLib.ApiError(400, fragment.message, {
        error: fragment.message,
        errorI18n: metadata,
      });
      vi.mocked(queryClientLib.apiRequest).mockRejectedValueOnce(apiError);
      act(() => setInterfaceLanguage("ar"));
      try {
        render(
          <IgdbTestConnectionButton clientId="id" clientSecret="secret" testEndpoint="/api/test" />
        );
        fireEvent.click(screen.getByRole("button"));
        await waitFor(() =>
          expect(document.querySelector("p.text-destructive bdi")).not.toBeNull()
        );
        const detail = document.querySelector("p.text-destructive bdi");
        expect(detail).toHaveAttribute("lang", kind === "valid" ? "ar" : "und");
        expect(detail).toHaveTextContent("Provider العربية: /user/{error}");
        if (kind !== "valid") expect(detail).toHaveTextContent(fragment.message);
      } finally {
        act(() => setInterfaceLanguage("en"));
      }
    }
  );

  const mockApiRequest = queryClientLib.apiRequest as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled until both credential fields are filled", () => {
    const { rerender } = render(
      <IgdbTestConnectionButton clientId="" clientSecret="" testEndpoint="/api/test" />
    );
    expect(screen.getByRole("button", { name: /test connection/i })).toBeDisabled();

    rerender(<IgdbTestConnectionButton clientId="abc" clientSecret="" testEndpoint="/api/test" />);
    expect(screen.getByRole("button", { name: /test connection/i })).toBeDisabled();

    rerender(
      <IgdbTestConnectionButton clientId="abc" clientSecret="def" testEndpoint="/api/test" />
    );
    expect(screen.getByRole("button", { name: /test connection/i })).toBeEnabled();
  });

  it("shows a success message when the server reports success", async () => {
    mockApiRequest.mockResolvedValue({
      json: async () => ({ success: true }),
    } as Response);

    render(<IgdbTestConnectionButton clientId="abc" clientSecret="def" testEndpoint="/api/test" />);
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByText("Connected successfully.")).toBeInTheDocument();
    });
    expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/test", {
      clientId: "abc",
      clientSecret: "def",
    });
  });

  it("shows the server's error message from a resolved { success: false } body", async () => {
    mockApiRequest.mockResolvedValue({
      json: async () => ({ success: false, error: "Client Secret is required" }),
    } as Response);

    render(<IgdbTestConnectionButton clientId="abc" clientSecret="def" testEndpoint="/api/test" />);
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByText("Client Secret is required")).toBeInTheDocument();
    });
  });

  it("shows the server's specific error message from a thrown ApiError", async () => {
    const { ApiError } = queryClientLib as unknown as {
      ApiError: new (status: number, message: string) => Error;
    };
    mockApiRequest.mockRejectedValue(new ApiError(400, "Invalid Client ID or Client Secret."));

    render(<IgdbTestConnectionButton clientId="abc" clientSecret="def" testEndpoint="/api/test" />);
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid Client ID or Client Secret.")).toBeInTheDocument();
    });
  });

  it("falls back to a generic message for a non-ApiError failure", async () => {
    mockApiRequest.mockRejectedValue(new Error("network down"));

    render(<IgdbTestConnectionButton clientId="abc" clientSecret="def" testEndpoint="/api/test" />);
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Could not reach the server to test the connection.")
      ).toBeInTheDocument();
    });
  });

  it("resets the result and ignores a stale in-flight response when credentials change mid-request", async () => {
    let resolveFirst: (value: { json: () => Promise<unknown> }) => void;
    mockApiRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { rerender } = render(
      <IgdbTestConnectionButton clientId="abc" clientSecret="def" testEndpoint="/api/test" />
    );
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    expect(screen.getByText(/testing/i)).toBeInTheDocument();

    // Edit a credential while the first request is still in flight.
    rerender(
      <IgdbTestConnectionButton clientId="edited" clientSecret="def" testEndpoint="/api/test" />
    );

    // Now let the stale first request resolve with a success payload.
    resolveFirst!({ json: async () => ({ success: true }) });
    await new Promise((r) => setTimeout(r, 0));

    // The stale "Connected successfully." must not appear for the edited, untested credentials.
    expect(screen.queryByText("Connected successfully.")).not.toBeInTheDocument();
  });
});
