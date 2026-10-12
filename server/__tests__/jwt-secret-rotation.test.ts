import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { User } from "@shared/schema";

const mocks = vi.hoisted(() => ({
  getSystemConfig: vi.fn(),
  setSystemConfig: vi.fn(),
}));
vi.mock("../config.js", () => ({ config: { auth: {} } }));
vi.mock("../storage.js", () => ({ storage: mocks }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe("stored JWT secret migration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("replaces a weak stored secret and signs only with the replacement", async () => {
    mocks.getSystemConfig.mockResolvedValue("weak");
    const { generateToken } = await import("../auth.js");
    const token = await generateToken({ id: "user", username: "operator" } as User);
    const replacement = mocks.setSystemConfig.mock.calls[0]?.[1] as string;
    expect(replacement).toMatch(/^[a-f0-9]{128}$/);
    expect(mocks.setSystemConfig).toHaveBeenCalledWith("jwt_secret", replacement);
    expect(jwt.verify(token, replacement)).toMatchObject({ id: "user" });
    expect(() => jwt.verify(token, "weak")).toThrow();
  });

  it("preserves a strong stored secret and existing sessions", async () => {
    const secret = "0123456789abcdef".repeat(4);
    mocks.getSystemConfig.mockResolvedValue(secret);
    const { generateToken } = await import("../auth.js");
    const token = await generateToken({ id: "user", username: "operator" } as User);
    expect(jwt.verify(token, secret)).toMatchObject({ id: "user" });
    expect(mocks.setSystemConfig).not.toHaveBeenCalled();
  });
});
