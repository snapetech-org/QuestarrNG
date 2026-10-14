import { afterEach, describe, expect, it, vi } from "vitest";
import { sendLogs } from "../send-logs";

const payload = {
  logs: "{}",
  appVersion: "1.11.0",
  platform: "linux",
  timestamp: "2026-10-13T12:00:00.000Z",
};

describe("sendLogs error messages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks exact catalog-backed server errors for localization", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Log payload is too large (> 500 KB). Try clearing old logs first.",
        }),
        { status: 413 }
      )
    );

    const result = await sendLogs(payload);

    expect(result).toMatchObject({
      ok: false,
      status: 413,
      message: "Log payload is too large (> 500 KB). Try clearing old logs first.",
      messageKey: "Log payload is too large (> 500 KB). Try clearing old logs first.",
    });
  });

  it("preserves unknown server error details as unlocalized source text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Worker request rejected by upstream." }), {
        status: 502,
      })
    );

    const result = await sendLogs(payload);

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      message: "Worker request rejected by upstream.",
    });
    expect(result).not.toHaveProperty("messageKey");
  });

  it("maps browser fetch failures to the localized network message", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await sendLogs(payload);

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: "Network error — check your connection.",
      messageKey: "Network error — check your connection.",
    });
  });

  it("preserves unexpected response errors as unlocalized details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("Unexpected response body")),
    } as unknown as Response);

    const result = await sendLogs(payload);

    expect(result).toMatchObject({
      ok: false,
      status: 0,
      message: "Unexpected response body",
    });
    expect(result).not.toHaveProperty("messageKey");
  });
});
