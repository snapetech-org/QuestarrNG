/* global fetch, AbortSignal */
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL, URL } from "node:url";
import { splitDiscordReleaseBody } from "./discord-release-notes.mjs";

function webhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A Discord webhook secret is missing or invalid.");
  }
  if (
    url.origin !== "https://discord.com" ||
    !/^\/api(?:\/v10)?\/webhooks\/\d+\/[\w.-]+$/u.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error("A Discord webhook secret is missing or invalid.");
  return url;
}

export async function announceDiscordRelease({
  release,
  repository,
  changelogWebhook,
  announcementWebhook,
  existingChangelogUrl = "",
  workflowUrl,
  fetchImpl = fetch,
  sleep = delay,
  saveReceipt = async () => {},
}) {
  const tag = release.tagName;
  if (
    !/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "") ||
    !/^v\d+\.\d+\.\d+$/u.test(tag ?? "") ||
    release.isDraft !== false ||
    release.isPrerelease !== false ||
    typeof release.body !== "string" ||
    !release.body.trim() ||
    release.url !== `https://github.com/${repository}/releases/tag/${tag}`
  )
    throw new Error("A published stable release with complete notes is required.");
  const changelog = webhookUrl(changelogWebhook);
  const announcement = webhookUrl(announcementWebhook);
  async function request(url, payload) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: payload ? "POST" : "GET",
        headers: payload ? { "Content-Type": "application/json" } : {},
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(
        "Discord request failed before receiving a response; check the saved receipt before retrying."
      );
    }
    if (!response.ok) throw new Error(`Discord request failed with HTTP ${response.status}.`);
    try {
      return await response.json();
    } catch {
      throw new Error("Discord returned an invalid message or webhook response.");
    }
  }
  const source = await request(changelog);
  const target = await request(announcement);
  const snowflake = (value) => typeof value === "string" && /^\d+$/u.test(value);
  if (
    !snowflake(source.guild_id) ||
    !snowflake(source.channel_id) ||
    source.guild_id !== target.guild_id ||
    !snowflake(target.channel_id) ||
    source.channel_id === target.channel_id
  )
    throw new Error(
      "Release notes and announcement must use distinct channels in the same Discord server."
    );
  const receipt = { tag, changelogMessageUrls: [], announcementMessageUrl: null };
  const messageUrl = (message, channel) => {
    if (!snowflake(message.id) || message.channel_id !== channel) {
      throw new Error("Discord returned an unexpected message destination.");
    }
    return `https://discord.com/channels/${source.guild_id}/${channel}/${message.id}`;
  };
  const titlePrefix = `QuestarrNG ${tag} release notes (`;
  if (existingChangelogUrl) {
    const match = /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/u.exec(
      existingChangelogUrl
    );
    if (!match || match[1] !== source.guild_id || match[2] !== source.channel_id) {
      throw new Error("The existing notes link must point into the changelog webhook's channel.");
    }
    const message = await request(new URL(`${changelog.pathname}/messages/${match[3]}`, changelog));
    if (
      !message.embeds?.some(
        (embed) => embed.title?.startsWith(titlePrefix) && embed.url === release.url
      )
    ) {
      throw new Error("The existing Discord message does not contain this release's notes.");
    }
    receipt.changelogMessageUrls.push(messageUrl(message, source.channel_id));
    await saveReceipt(receipt);
  } else {
    await saveReceipt(receipt);
    const chunks = splitDiscordReleaseBody(release.body);
    changelog.searchParams.set("wait", "true");
    for (let index = 0; index < chunks.length; index += 1) {
      const message = await request(changelog, {
        username: "QuestarrNG Releases",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: `${titlePrefix}${index + 1}/${chunks.length})`,
            url: release.url,
            description: chunks[index],
            color: 5814783,
            fields:
              index === 0
                ? [
                    {
                      name: "Image",
                      value: `ghcr.io/${repository.toLowerCase()}:${tag.slice(1)}`,
                      inline: false,
                    },
                    ...(workflowUrl
                      ? [{ name: "Workflow", value: workflowUrl, inline: false }]
                      : []),
                  ]
                : [],
          },
        ],
      });
      receipt.changelogMessageUrls.push(messageUrl(message, source.channel_id));
      await saveReceipt(receipt);
      if (index < chunks.length - 1) await sleep(1000);
    }
  }
  announcement.searchParams.set("wait", "true");
  const message = await request(announcement, {
    username: "QuestarrNG Releases",
    allowed_mentions: { parse: [] },
    content: `**QuestarrNG ${tag} released**\n[Full release notes in #changelogs](${receipt.changelogMessageUrls[0]})\n[Release and downloads](${release.url})`,
  });
  receipt.announcementMessageUrl = messageUrl(message, target.channel_id);
  await saveReceipt(receipt);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const tag = process.env.TAG;
    const repository = process.env.GITHUB_REPOSITORY;
    if (!/^v\d+\.\d+\.\d+$/u.test(tag ?? "") || !/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "")) {
      throw new Error("A release tag and GitHub repository are required.");
    }
    const release = JSON.parse(
      execFileSync(
        "gh",
        [
          "release",
          "view",
          tag,
          "--repo",
          repository,
          "--json",
          "body,isDraft,isPrerelease,tagName,url",
        ],
        { encoding: "utf8" }
      )
    );
    const receipt = await announceDiscordRelease({
      release,
      repository,
      changelogWebhook: process.env.DISCORD_WEBHOOK,
      announcementWebhook: process.env.DISCORD_ANNOUNCEMENT_WEBHOOK,
      existingChangelogUrl: process.env.CHANGELOG_MESSAGE_URL,
      workflowUrl: `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      saveReceipt: async (value) => {
        if (process.env.ANNOUNCEMENT_RECEIPT)
          await writeFile(process.env.ANNOUNCEMENT_RECEIPT, JSON.stringify(value, null, 2) + "\n");
      },
    });
    process.stdout.write(
      `Release notes: ${receipt.changelogMessageUrls[0]}\nAnnouncement: ${receipt.announcementMessageUrl}\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
