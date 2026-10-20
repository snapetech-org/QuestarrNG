#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";

const aliases = ["main", "master", "latest", "stable"];
const workflows = [
  [".github/workflows/fork-image.yml", 4],
  [".github/workflows/sync-stable-image-aliases.yml", 2],
];

const readHead = process.argv.includes("--head");

function readPolicyFile(path) {
  const ref = readHead ? "HEAD:" + path : ":" + path;
  return execFileSync("git", ["show", ref], { encoding: "utf8" });
}

function checkWorkflow(path, expectedCount) {
  const source = readPolicyFile(path);
  const publishLoops = [
    ...source.matchAll(/for tag in ([^\r\n;]+); do\r?\n([\s\S]*?)\r?\n[ \t]*done/gu),
  ].filter(([, , body]) =>
    /docker buildx imagetools create|^[ \t]*copy --authfile/mu.test(body)
  );

  if (publishLoops.length !== expectedCount) {
    throw new Error(
      path +
        " must have " +
        expectedCount +
        " production image-tag publishing loops; found " +
        publishLoops.length
    );
  }

  for (const [index, [, declaredTags]] of publishLoops.entries()) {
    const tags = new Set(
      declaredTags.match(/"[^"]+"|'[^']+'|[^\s]+/gu).map((tag) => tag.replace(/^["']|["']$/gu, ""))
    );
    const missing = aliases.filter((alias) => !tags.has(alias));
    if (missing.length > 0) {
      throw new Error(
        path + " publishing loop " + (index + 1) + " is missing aliases: " + missing.join(", ")
      );
    }
  }
}

for (const [path, expectedCount] of workflows) {
  checkWorkflow(path, expectedCount);
}

process.stdout.write("Docker stable image aliases are synchronized in every publishing path.\n");
