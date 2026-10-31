import { describe, expect, it, vi } from "vitest";
import type { Downloader } from "../../shared/schema.js";
import { RealDebridClient } from "../downloaders/realdebrid.js";
import { safeFetch } from "../ssrf.js";
vi.mock("../storage.js", () => ({ storage: {} }));
vi.mock("../ssrf.js", () => ({ safeFetch: vi.fn(), isSafeUrl: vi.fn() }));
vi.mock("../logger.js", () => ({
  downloadersLogger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function client() {
  const instance = new RealDebridClient({
    id: "qa",
    downloadPath: "/srv/Stage/My Game",
  } as Downloader);
  const request = vi.spyOn(
    instance as unknown as { request: (path: string) => Promise<unknown> },
    "request"
  );
  return { instance, request };
}
describe("Real-Debrid connection message metadata", () => {
  it.each(["My User العربية", undefined])(
    "preserves account/path values when the account is %s",
    async (username) => {
      const { instance, request } = client();
      request.mockResolvedValue({ username });
      const result = await instance.testConnection();
      expect(result).toMatchObject({
        success: true,
        messageKey: username ? "service.realdebrid_connected_user" : "service.realdebrid_connected",
        messageValues: { path: "/srv/Stage/My Game", ...(username ? { username } : {}) },
      });
      expect(result.message).toContain("/srv/Stage/My Game");
      if (username) expect(result.message).toContain(username);
      expect(safeFetch).not.toHaveBeenCalled();
    }
  );
  it("keeps provider rejection text untagged", async () => {
    const { instance, request } = client();
    request.mockRejectedValue(new Error("Provider: custom rejection"));
    expect(await instance.testConnection()).toEqual({
      success: false,
      message: "Provider: custom rejection",
    });
  });
});
