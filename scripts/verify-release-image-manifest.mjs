import console from "node:console";
import { appendFile, readFile } from "node:fs/promises";
import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const expectedPlatforms = ["linux/amd64", "linux/arm64"];

export function getReleasePlatformDigests(manifest) {
  if (!Array.isArray(manifest?.manifests)) {
    throw new Error("Image manifest must contain a platform manifest array.");
  }

  const platformManifests = manifest.manifests.filter(
    (entry) => entry?.platform?.os && entry.platform.os !== "unknown"
  );
  const platforms = platformManifests
    .map(({ platform }) => `${platform.os}/${platform.architecture}`)
    .sort();
  if (JSON.stringify(platforms) !== JSON.stringify(expectedPlatforms)) {
    throw new Error(
      `Expected exactly ${expectedPlatforms.join(" and ")} image manifests; found ${platforms.join(", ") || "none"}.`
    );
  }

  return Object.fromEntries(
    expectedPlatforms.map((platformName) => {
      const [os, architecture] = platformName.split("/");
      const matches = platformManifests.filter(
        ({ platform }) => platform.os === os && platform.architecture === architecture
      );
      if (matches.length !== 1) {
        throw new Error(`Expected one ${platformName} image manifest; found ${matches.length}.`);
      }

      const digest = matches[0].digest;
      if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) {
        throw new Error(`The ${platformName} image manifest has an invalid digest.`);
      }
      return [architecture, digest];
    })
  );
}

async function main() {
  const manifestPath = process.argv[2];
  const image = process.env.IMAGE;
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!manifestPath || !image || !githubOutput) {
    throw new Error(
      "Usage: IMAGE=<image> GITHUB_OUTPUT=<path> node verify-release-image-manifest.mjs <manifest.json>"
    );
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const digests = getReleasePlatformDigests(manifest);
  await appendFile(
    githubOutput,
    `amd64_image=${image}@${digests.amd64}\narm64_image=${image}@${digests.arm64}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
