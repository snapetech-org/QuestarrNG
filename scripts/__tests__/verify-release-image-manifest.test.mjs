import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cwd } from "node:process";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { getReleasePlatformDigests } from "../verify-release-image-manifest.mjs";

const amd64Digest = `sha256:${"a".repeat(64)}`;
const arm64Digest = `sha256:${"b".repeat(64)}`;
const manifest = {
  manifests: [
    { digest: arm64Digest, platform: { os: "linux", architecture: "arm64" } },
    { digest: `sha256:${"c".repeat(64)}`, platform: { os: "unknown", architecture: "unknown" } },
    { digest: amd64Digest, platform: { os: "linux", architecture: "amd64" } },
  ],
};

describe("release image manifest verification", () => {
  it("returns exact child digests for both published architectures", () => {
    expect(getReleasePlatformDigests(manifest)).toEqual({ amd64: amd64Digest, arm64: arm64Digest });
  });

  it("rejects a single-platform image", () => {
    expect(() => getReleasePlatformDigests({ manifests: manifest.manifests.slice(0, 1) })).toThrow(
      "Expected exactly linux/amd64 and linux/arm64"
    );
  });

  it("rejects duplicate or unexpected platforms", () => {
    expect(() =>
      getReleasePlatformDigests({
        manifests: [
          ...manifest.manifests,
          { digest: amd64Digest, platform: { os: "linux", architecture: "amd64" } },
        ],
      })
    ).toThrow("Expected exactly linux/amd64 and linux/arm64");
    expect(() =>
      getReleasePlatformDigests({
        manifests: [
          ...manifest.manifests,
          { digest: amd64Digest, platform: { os: "linux", architecture: "arm/v7" } },
        ],
      })
    ).toThrow("Expected exactly linux/amd64 and linux/arm64");
  });

  it("rejects a platform descriptor without a valid immutable digest", () => {
    expect(() =>
      getReleasePlatformDigests({
        manifests: manifest.manifests.map((entry) =>
          entry.platform.architecture === "arm64" ? { ...entry, digest: "latest" } : entry
        ),
      })
    ).toThrow("The linux/arm64 image manifest has an invalid digest.");
  });

  it("writes digest-pinned references to GitHub Actions outputs", () => {
    const directory = mkdtempSync(join(cwd(), ".tmp-release-manifest-"));
    try {
      const manifestPath = join(directory, "manifest.json");
      const outputPath = join(directory, "github-output.txt");
      writeFileSync(manifestPath, JSON.stringify(manifest));
      writeFileSync(outputPath, "");
      execFileSync(
        process.execPath,
        [resolve(cwd(), "scripts/verify-release-image-manifest.mjs"), manifestPath],
        {
          env: {
            ...process.env,
            IMAGE: "ghcr.io/snapetech/questarrng",
            GITHUB_OUTPUT: outputPath,
          },
        }
      );
      expect(readFileSync(outputPath, "utf8")).toBe(
        `amd64_image=ghcr.io/snapetech/questarrng@${amd64Digest}\n` +
          `arm64_image=ghcr.io/snapetech/questarrng@${arm64Digest}\n`
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("scans both exact platform digests before attaching the release tag", () => {
    const workflow = load(readFileSync(resolve(cwd(), ".github/workflows/fork-image.yml"), "utf8"));
    const steps = workflow.jobs.publish.steps;
    const tagsStep = steps.find((step) => step.id === "tags");
    const buildIndex = steps.findIndex((step) => step.id === "build-image");
    const verifyIndex = steps.findIndex((step) => step.id === "verify-image");
    const scanSteps = steps.filter((step) => step.name?.startsWith("Scan the verified linux/"));
    const smokeIndex = steps.findIndex(
      (step) => step.name === "Smoke test published image and SeerrNG route"
    );
    const attachIndex = steps.findIndex(
      (step) => step.name === "Attach publish tag after scans and smoke test pass"
    );
    const attachStep = steps[attachIndex];

    expect(tagsStep.run).toContain("$IMAGE:sha-${GITHUB_SHA}");
    expect(tagsStep.run).not.toContain("$IMAGE:latest");
    expect(tagsStep.run).not.toContain("$IMAGE:${GITHUB_REF_NAME#v}");
    expect(verifyIndex).toBeGreaterThan(buildIndex);
    expect(scanSteps).toHaveLength(2);
    expect(attachIndex).toBeGreaterThan(verifyIndex);
    expect(attachIndex).toBeGreaterThan(smokeIndex);
    const scanByPlatform = Object.fromEntries(
      scanSteps.map((step) => [step.name.match(/linux\/(amd64|arm64)/)[1], step])
    );
    expect(scanByPlatform.amd64.with["image-ref"]).toBe(
      "${{ steps.verify-image.outputs.amd64_image }}"
    );
    expect(scanByPlatform.arm64.with["image-ref"]).toBe(
      "${{ steps.verify-image.outputs.arm64_image }}"
    );
    for (const scan of scanSteps) {
      expect(scan.uses).toMatch(/^aquasecurity\/trivy-action@/);
      expect(scan.env.TRIVY_VEX).toBe("security/vex/questarr.openvex.json");
      expect(scan.with).toMatchObject({
        severity: "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL",
        scanners: "vuln",
        "exit-code": "1",
        cache: "false",
      });
    }
    expect(
      scanSteps.every(
        (step) => steps.indexOf(step) > verifyIndex && steps.indexOf(step) < attachIndex
      )
    ).toBe(true);
    expect(attachStep.run).toContain("docker buildx imagetools create");
    expect(attachStep.env.BUILD_DIGEST).toBe("${{ steps.build-image.outputs.digest }}");
    expect(attachStep.env.RELEASE_TAG).toBe("${{ steps.tags.outputs.release_tag }}");
  });
});
