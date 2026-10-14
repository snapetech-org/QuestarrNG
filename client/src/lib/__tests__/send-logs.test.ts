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
});
