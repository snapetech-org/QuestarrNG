import { serviceMessage, parseServiceMessageDescriptor } from "../../shared/service-messages.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("../ssrf.js", () => ({ safeFetch }));

import { formatRawgGame, rawgClient } from "../rawg.js";

describe("optional RAWG provider", () => {
  it.each([429, 503])(
    "tags fixed RAWG HTTP failure %s without capturing the key",
    async (status) => {
      safeFetch.mockResolvedValueOnce(new Response("provider body", { status }));
      const result = await rawgClient.testCredentials("never-in-message");
      expect(parseServiceMessageDescriptor(result)?.messageKey).toBe(
        status === 429 ? "service.rawg_rate_limit" : "service.rawg_http_error"
      );
      expect(JSON.stringify(result)).not.toContain("never-in-message");
      expect(JSON.stringify(result)).not.toContain("provider body");
    }
  );
  it("tags the safe RAWG network fallback while retaining URL/credential redaction", async () => {
    safeFetch.mockRejectedValueOnce(new Error("https://rawg.example?key=never-in-message"));
    const result = await rawgClient.testCredentials("never-in-message");
    expect(result).toEqual({
      success: false,
      ...serviceMessage("service.rawg_connect_failed", {}),
    });
    expect(JSON.stringify(result)).not.toContain("never-in-message");
  });
  it("reuses the existing translated success source for RAWG credential tests", async () => {
    safeFetch.mockResolvedValueOnce(Response.json({ results: [] }));
    expect(await rawgClient.testCredentials("new-success-key")).toEqual({
      success: true,
      ...serviceMessage("interface.rawg_api_key_is_valid_5d4211bd", {}),
    });
  });

  beforeEach(() => {
    safeFetch.mockReset();
    rawgClient.clearCache();
  });

  it("maps RAWG IDs and metadata without taking the IGDB identity", () => {
    const game = formatRawgGame({
      id: 4312,
      slug: "sample-game",
      name: "Sample Game",
      rating: 4.25,
      released: "2020-04-05",
      esrb_rating: { id: 4, name: "Mature" },
      platforms: [{ platform: { id: 4, name: "PC" } }],
      genres: [{ id: 3, name: "Adventure" }],
    });

    expect(game).toMatchObject({
      id: "rawg-4312",
      rawgId: 4312,
      rawgSlug: "sample-game",
      igdbId: null,
      rating: 8.5,
      releaseDate: "2020-04-05",
      platforms: ["PC"],
      genres: ["Adventure"],
      isAgeRestricted: true,
      source: "rawg",
    });
  });

  it("uses RAWG's documented API-key parameter and caches successful results", async () => {
    safeFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ results: [{ id: 1, name: "Game", slug: "game" }] }), {
          headers: { "content-type": "application/json" },
        })
    );
    expect((await rawgClient.popular("example-secret", 1))[0]).toMatchObject({
      rawgId: 1,
      title: "Game",
    });
    const [requestUrl] = safeFetch.mock.calls[0] as [string];
    expect(new URL(requestUrl).origin).toBe("https://api.rawg.io");
    expect(new URL(requestUrl).searchParams.get("key")).toBe("example-secret");
    expect(safeFetch).toHaveBeenCalledTimes(1);
    await rawgClient.popular("example-secret", 1);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    await rawgClient.popular("different-secret", 1);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it("returns a safe settings error for rejected credentials", async () => {
    safeFetch.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    expect(await rawgClient.testCredentials("invalid-key")).toEqual({
      success: false,
      ...serviceMessage("service.rawg_key_rejected", {}),
    });
  });
});
