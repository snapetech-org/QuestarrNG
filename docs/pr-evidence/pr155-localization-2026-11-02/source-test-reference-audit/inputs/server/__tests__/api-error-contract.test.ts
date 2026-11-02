import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { attachApiErrorCode } from "../api-error-contract";

function dispatch(path: string, statusCode: number, body: unknown) {
  const sent: unknown[] = [];
  const response = {
    statusCode,
    json(value?: unknown) {
      sent.push(value);
      return response as unknown as Response;
    },
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  attachApiErrorCode({ path } as Request, response, next);
  const returned = response.json(body);
  return { body: sent[0], next, returned, response };
}

describe("attachApiErrorCode", () => {
  it.each([
    ["/api", 400, { error: "Invalid input" }, "api.bad_request"],
    ["/api/games", 404, { message: "Game not found" }, "api.not_found"],
    ["/api/keys", 500, { error: "Server failure" }, "api.server_error"],
  ])("adds a stable code to API error responses for %s", (path, status, input, code) => {
    const result = dispatch(path, status, input);

    expect(result.body).toEqual({ ...input, errorCode: code });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.returned).toBe(result.response);
  });

  it("preserves an explicit code and leaves API payloads without error text alone", () => {
    const explicit = { error: "Denied", errorCode: "api.custom" };
    expect(dispatch("/api/keys", 403, explicit).body).toEqual(explicit);

    const noErrorText = { result: "ok" };
    expect(dispatch("/api/keys", 403, noErrorText).body).toBe(noErrorText);
  });

  it("leaves non-API, successful, and non-object responses unchanged", () => {
    const cases: Array<[string, number, unknown]> = [
      ["/health", 500, { error: "Not an API error" }],
      ["/api/games", 200, { error: "Successful response" }],
      ["/api/games", 400, null],
      ["/api/games", 400, "Invalid body"],
      ["/api/games", 400, ["Invalid body"]],
    ];

    for (const [path, status, body] of cases) {
      expect(dispatch(path, status, body).body).toBe(body);
    }
  });
});
