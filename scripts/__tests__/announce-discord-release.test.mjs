// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { announceDiscordRelease } from "../announce-discord-release.mjs";

const sourceHook = "https://discord.com/api/webhooks/10/test-source";
const targetHook = "https://discord.com/api/webhooks/20/test-target";
const release = {
  tagName: "v2.2.2",
  isDraft: false,
  isPrerelease: false,
  body: "Notes\n".repeat(800),
  url: "https://github.com/snapetech-org/QuestarrNG/releases/tag/v2.2.2",
};
const link = "https://discord.com/channels/100/200/300";
function fixture({ existing = false, failSecondChunk = false, wrongRelease = false } = {}) {
  let sourcePosts = 0;
  const fetchImpl = vi.fn(async (url, options) => {
    const parsed = new URL(url);
    let body;
    if (options.method === "GET") {
      if (parsed.pathname.includes("/messages/")) {
        body = {
          id: "300",
          channel_id: "200",
          embeds: [
            {
              title: `QuestarrNG ${wrongRelease ? "v1.0.0" : "v2.2.2"} release notes (1/2)`,
              url: release.url,
            },
          ],
        };
      } else
        body = { guild_id: "100", channel_id: parsed.pathname.includes("/10/") ? "200" : "201" };
    } else if (parsed.pathname.includes("/10/")) {
      sourcePosts += 1;
      if (sourcePosts === 2 && failSecondChunk) return { ok: false, status: 429 };
      body = { id: String(299 + sourcePosts), channel_id: "200" };
    } else body = { id: "400", channel_id: "201" };
    return { ok: true, json: async () => body };
  });
  const receipts = [];
  const options = {
    release,
    repository: "snapetech-org/QuestarrNG",
    changelogWebhook: sourceHook,
    announcementWebhook: targetHook,
    existingChangelogUrl: existing ? link : "",
    fetchImpl,
    sleep: async () => {},
    saveReceipt: async (receipt) => receipts.push(structuredClone(receipt)),
  };
  return { options, fetchImpl, receipts };
}

describe("linked Discord release announcements", () => {
  it("automatically announces normal releases after publication and metadata sync succeed", () => {
    const workflow = load(readFileSync(".github/workflows/fork-image.yml", "utf8"));
    const job = workflow.jobs["announce-release"];
    expect(job.needs).toContain("sync-release-metadata");
    expect(job.if).toContain("inputs.release_tag != '' && needs.release.result == 'success'");
    expect(job.if).toContain("needs['sync-release-metadata'].result == 'success'");
  });

  it("delivers every changelog chunk before posting its first message link to the other channel", async () => {
    const { options, fetchImpl, receipts } = fixture();
    const receipt = await announceDiscordRelease(options);
    const posts = fetchImpl.mock.calls.filter(([, request]) => request.method === "POST");
    expect(posts).toHaveLength(3);
    expect(posts.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/webhooks/10/test-source",
      "/api/webhooks/10/test-source",
      "/api/webhooks/20/test-target",
    ]);
    expect(posts.every(([url]) => new URL(url).searchParams.get("wait") === "true")).toBe(true);
    const announcement = JSON.parse(posts[2][1].body);
    expect(announcement.content).toContain(link);
    expect(announcement.allowed_mentions).toEqual({ parse: [] });
    expect(receipt.announcementMessageUrl).toBe("https://discord.com/channels/100/201/400");
    expect(receipts.at(-2).changelogMessageUrls).toHaveLength(2);
    expect(receipts.at(-1)).toEqual(receipt);
  });

  it("reuses a verified existing changelog without reposting its notes", async () => {
    const { options, fetchImpl } = fixture({ existing: true });
    await announceDiscordRelease(options);
    const posts = fetchImpl.mock.calls.filter(([, request]) => request.method === "POST");
    expect(posts).toHaveLength(1);
    expect(String(posts[0][0])).toContain("/20/test-target");
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith("/messages/300"))).toBe(true);
  });

  it("keeps partial delivery receipts and never announces an incomplete changelog", async () => {
    const { options, fetchImpl, receipts } = fixture({ failSecondChunk: true });
    await expect(announceDiscordRelease(options)).rejects.toThrow("HTTP 429");
    expect(receipts.at(-1).changelogMessageUrls).toEqual([link]);
    expect(
      fetchImpl.mock.calls.some(
        ([url, request]) => String(url).includes("/20/") && request.method === "POST"
      )
    ).toBe(false);
  });

  it("rejects another release's existing message before posting", async () => {
    const { options, fetchImpl } = fixture({ existing: true, wrongRelease: true });
    await expect(announceDiscordRelease(options)).rejects.toThrow("does not contain this release");
    expect(fetchImpl.mock.calls.every(([, request]) => request.method === "GET")).toBe(true);
  });

  it("requires both secrets and a stable release before making requests", async () => {
    const { options, fetchImpl } = fixture();
    await expect(
      announceDiscordRelease({ ...options, announcementWebhook: undefined })
    ).rejects.toThrow("secret is missing");
    await expect(
      announceDiscordRelease({ ...options, release: { ...release, isDraft: true } })
    ).rejects.toThrow("published stable release");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose webhook secrets from network exceptions", async () => {
    const { options } = fixture();
    options.fetchImpl = async () => {
      throw new Error(sourceHook);
    };
    await expect(announceDiscordRelease(options)).rejects.toThrow(
      "Discord request failed before receiving a response"
    );
  });

  it("uses the shared sender and retains non-secret message receipts in both workflows", () => {
    for (const file of ["fork-image.yml", "trusted-discord-release-announcement.yml"]) {
      const workflow = load(readFileSync(`.github/workflows/${file}`, "utf8"));
      const job = workflow.jobs["announce-release"];
      expect(job.env.DISCORD_ANNOUNCEMENT_WEBHOOK).toBe(
        "${{ secrets.DISCORD_ANNOUNCEMENT_WEBHOOK }}"
      );
      expect(
        job.steps.some((step) => step.run === "node scripts/announce-discord-release.mjs")
      ).toBe(true);
      expect(job.steps.find((step) => step.uses?.startsWith("actions/checkout@")).with.ref).toBe(
        "${{ github.sha }}"
      );
      expect(
        job.steps.some(
          (step) => step.uses?.startsWith("actions/upload-artifact@") && step.if === "always()"
        )
      ).toBe(true);
    }
  });
});
