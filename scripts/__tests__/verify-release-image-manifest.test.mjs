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
            IMAGE: "ghcr.io/snapetech-org/questarrng",
            GITHUB_OUTPUT: outputPath,
          },
        }
      );
      expect(readFileSync(outputPath, "utf8")).toBe(
        `amd64_image=ghcr.io/snapetech-org/questarrng@${amd64Digest}\n` +
          `arm64_image=ghcr.io/snapetech-org/questarrng@${arm64Digest}\n`
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("labels the published image with its build version and organization repository source", () => {
    const dockerfile = readFileSync(resolve(cwd(), "Dockerfile"), "utf8");
    const sourceLabel = dockerfile.match(/^LABEL org\.opencontainers\.image\.source="([^"]+)"$/mu);
    const versionLabel = dockerfile.match(
      /^LABEL org\.opencontainers\.image\.version="([^"]+)"$/mu
    );

    expect(sourceLabel?.[1]).toBe("https://github.com/snapetech-org/QuestarrNG");
    expect(dockerfile).toContain("ARG QUESTARR_VERSION=dev");
    expect(versionLabel?.[1]).toBe("${QUESTARR_VERSION}");
  });

  it("builds each release architecture natively and scans both exact digests before aliases", () => {
    const workflow = load(readFileSync(resolve(cwd(), ".github/workflows/fork-image.yml"), "utf8"));
    const security = workflow.jobs["release-security"];
    const platformBuild = workflow.jobs["build-source-image"];
    const nativeRunners = platformBuild.strategy.matrix.include.map((entry) => entry.runner);
    expect(platformBuild.needs).toBe("release-security");
    expect(nativeRunners).toContain("linux-x64");
    expect(nativeRunners).toContain("linux-arm64");
    expect(platformBuild["runs-on"]).toContain("ng-shared-main-jit");
    expect(
      platformBuild.steps.some((step) => step.uses?.startsWith("step-security/setup-qemu-action@"))
    ).toBe(false);
    const platformBuildStep = platformBuild.steps.find((step) => step.id === "build-image");
    expect(platformBuildStep.with.platforms).toBe("${{ matrix.platform }}");
    expect(platformBuildStep.with.outputs).toContain("push-by-digest=true");
    expect(platformBuildStep.with["build-args"]).toBe(
      "QUESTARR_VERSION=${{ needs.release-security.outputs.version }}"
    );
    expect(
      security.steps.some(
        (step) => step.name === "Require clean security before building versioned images"
      )
    ).toBe(true);

    const steps = workflow.jobs.publish.steps;
    const tagsStep = steps.find((step) => step.id === "tags");
    const buildIndex = steps.findIndex((step) => step.id === "publish-image");
    const verifyIndex = steps.findIndex((step) => step.id === "verify-image");
    const scanSteps = steps.filter((step) => step.name?.startsWith("Scan the verified linux/"));
    expect(tagsStep.run).toContain("node scripts/fork-image-tags.mjs");
    expect(tagsStep.run).not.toContain("$IMAGE:latest");
    expect(tagsStep.run).not.toContain("$IMAGE:${GITHUB_REF_NAME#v}");
    expect(steps[buildIndex].run).toContain("docker buildx imagetools create");
    expect(steps[buildIndex].run).toContain("digest-amd64");
    expect(steps[buildIndex].run).toContain("digest-arm64");
    expect(verifyIndex).toBeGreaterThan(buildIndex);
    expect(scanSteps).toHaveLength(2);
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
    expect(scanSteps.every((step) => steps.indexOf(step) > verifyIndex)).toBe(true);

    const releaseSteps = workflow.jobs.release.steps;
    const assetsVerifiedIndex = releaseSteps.findIndex(
      (step) => step.name === "Verify draft release assets"
    );
    const attachIndex = releaseSteps.findIndex(
      (step) => step.name === "Attach versioned GHCR tags after all release assets pass"
    );
    const publishIndex = releaseSteps.findIndex(
      (step) => step.name === "Publish verified GitHub release"
    );
    const attachStep = releaseSteps[attachIndex];
    expect(assetsVerifiedIndex).toBeGreaterThanOrEqual(0);
    expect(attachIndex).toBeGreaterThan(assetsVerifiedIndex);
    expect(publishIndex).toBeGreaterThan(attachIndex);
    expect(attachStep.run).toContain("docker buildx imagetools create");
    expect(attachStep.env.BUILD_DIGEST).toBe("${{ needs.publish.outputs.digest }}");
    expect(attachStep.env.TAG).toBe("${{ inputs.release_tag }}");
  });
});
