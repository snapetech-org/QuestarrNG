import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { load } from "js-yaml";
import {
  REQUIRED_CHECKS,
  REQUIRED_CODE_ANALYSES,
  securityBlockers,
  sourceAnalysisBlockers,
} from "../check-release-security.mjs";

const successfulChecks = () =>
  REQUIRED_CHECKS.map((name) => ({
    name,
    status: "completed",
    conclusion: "success",
  }));

describe("release security gate", () => {
  it("grants every publishing gate the fallback token's required API read permissions", () => {
    const workflow = load(readFileSync(resolve(cwd(), ".github/workflows/fork-image.yml"), "utf8"));
    const gates = Object.entries(workflow.jobs).filter(([, job]) =>
      job.steps?.some((step) => step.run?.includes("node scripts/check-release-security.mjs"))
    );
    expect(gates.map(([name]) => name)).toEqual(["publish", "release", "finalize-release"]);
    for (const [, job] of gates) {
      expect(job.permissions).toMatchObject({
        checks: "read",
        "security-events": "read",
        "vulnerability-alerts": "read",
      });
    }
  });

  it("scans every Trivy severity and rescans the verified release digest during recovery", () => {
    const vulnerabilityWorkflow = load(
      readFileSync(resolve(cwd(), ".github/workflows/vulnerability-scan.yml"), "utf8")
    );
    const trivyScan = vulnerabilityWorkflow.jobs["image-scan"].steps.find(
      (step) => step.id === "trivy"
    );
    expect(trivyScan.with.severity.split(",")).toEqual([
      "UNKNOWN",
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ]);
    expect(trivyScan.with.cache).toBe("${{ github.ref_type != 'tag' }}");

    const workflow = load(readFileSync(resolve(cwd(), ".github/workflows/fork-image.yml"), "utf8"));
    const steps = workflow.jobs["finalize-release"].steps;
    const verifyIndex = steps.findIndex((step) => step.id === "verify-image");
    const rescanSteps = steps.filter((step) => step.name?.startsWith("Rescan the verified linux/"));
    const gateIndex = steps.findIndex((step) =>
      step.run?.includes("node scripts/check-release-security.mjs")
    );
    expect(verifyIndex).toBeGreaterThanOrEqual(0);
    expect(rescanSteps).toHaveLength(2);
    const rescanIndices = rescanSteps.map((step) => steps.indexOf(step));
    expect(rescanIndices.every((index) => index > verifyIndex && index < gateIndex)).toBe(true);
    const rescanByPlatform = Object.fromEntries(
      rescanSteps.map((step) => [step.name.match(/linux\/(amd64|arm64)/)[1], step])
    );
    expect(rescanByPlatform.amd64.with["image-ref"]).toBe(
      "${{ steps.verify-image.outputs.amd64_image }}"
    );
    expect(rescanByPlatform.arm64.with["image-ref"]).toBe(
      "${{ steps.verify-image.outputs.arm64_image }}"
    );
    for (const rescan of rescanSteps) {
      expect(rescan.uses).toMatch(/^aquasecurity\/trivy-action@/);
      expect(rescan.env.TRIVY_VEX).toBe("security/vex/questarr.openvex.json");
      expect(rescan.with).toMatchObject({
        severity: "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL",
        scanners: "vuln",
        "exit-code": "1",
        cache: "false",
      });
    }
    const verifyStep = steps[verifyIndex];
    expect(verifyStep.run).toContain(
      'select(.platform.os == "linux" and .platform.architecture == "amd64")'
    );
    expect(verifyStep.run).toContain(
      'select(.platform.os == "linux" and .platform.architecture == "arm64")'
    );
    expect(verifyStep.run).toContain("amd64_image=${image}@${amd64_digest}");
    expect(verifyStep.run).toContain("arm64_image=${image}@${arm64_digest}");
  });

  it("permits a clean source commit only after every required scan succeeds", () => {
    expect(securityBlockers([], [], successfulChecks())).toEqual([]);
  });

  it("uses code alert instances for the exact release tag", () => {
    const releaseRef = "refs/tags/v1.2.3";
    const sourceFinding = {
      number: 51,
      state: "fixed",
      tool: { name: "CodeQL" },
      html_url: "release-source-alert",
      most_recent_instance: { ref: releaseRef, state: "open" },
    };
    expect(securityBlockers([sourceFinding], [], successfulChecks(), releaseRef)).toEqual([
      "Open CodeQL alert #51: release-source-alert",
    ]);

    const findingFixedOnRelease = {
      ...sourceFinding,
      state: "open",
      most_recent_instance: { ref: releaseRef, state: "fixed" },
    };
    expect(securityBlockers([findingFixedOnRelease], [], successfulChecks(), releaseRef)).toEqual(
      []
    );

    const mismatchedRef = {
      ...sourceFinding,
      state: "open",
      most_recent_instance: { ref: "refs/heads/main", state: "open" },
    };
    expect(securityBlockers([mismatchedRef], [], successfulChecks(), releaseRef)).toEqual([
      "Open CodeQL alert #51: release-source-alert",
    ]);
    expect(
      securityBlockers([{ ...mismatchedRef, state: "fixed" }], [], successfulChecks(), releaseRef)
    ).toEqual(["Open CodeQL alert #51: release-source-alert"]);
  });

  it("checks release alerts without treating omitted check runs as missing checks", () => {
    const releaseRef = "refs/tags/v1.2.3";
    expect(securityBlockers([], [], null, releaseRef)).toEqual([]);
    expect(
      securityBlockers(
        [
          {
            number: 51,
            state: "open",
            tool: { name: "CodeQL" },
            html_url: "release-source-alert",
            most_recent_instance: { ref: releaseRef, state: "open" },
          },
        ],
        [],
        null,
        releaseRef
      )
    ).toEqual(["Open CodeQL alert #51: release-source-alert"]);
    expect(securityBlockers([], [], [])).toHaveLength(REQUIRED_CHECKS.length);
  });

  it("requires exact-ref analyses for every release code scanner", () => {
    const releaseRef = "refs/tags/v1.2.3";
    const releaseSha = "a".repeat(40);
    const analyses = REQUIRED_CODE_ANALYSES.map(({ tool, category }) => ({
      ref: releaseRef,
      commit_sha: releaseSha,
      tool: { name: tool },
      category,
      error: "",
      created_at: "2026-10-12T10:00:00Z",
    }));
    expect(sourceAnalysisBlockers(analyses, releaseRef, releaseSha)).toEqual([]);
    expect(sourceAnalysisBlockers(analyses.slice(1), releaseRef, releaseSha)).toEqual([
      "CodeQL /language:csharp analysis is missing for " + releaseRef + "@" + releaseSha,
    ]);
    expect(sourceAnalysisBlockers(analyses, releaseRef, "b".repeat(40))).toHaveLength(
      REQUIRED_CODE_ANALYSES.length
    );
  });

  it("recognizes GitHub's actual Semgrep OSS analysis identity and rejects failed uploads", () => {
    const ref = "refs/tags/v1.2.3";
    const commit_sha = "a".repeat(40);
    const analyses = [
      ...["csharp", "javascript-typescript", "actions"].map((language) => ({
        ref,
        commit_sha,
        tool: { name: "CodeQL" },
        category: "/language:" + language,
        error: "",
        created_at: "2026-10-12T10:00:00Z",
      })),
      {
        ref,
        commit_sha,
        tool: { name: "Semgrep OSS" },
        category: ".github/workflows/sast.yml:semgrep",
        error: "",
        created_at: "2026-10-12T10:00:00Z",
      },
    ];
    expect(sourceAnalysisBlockers(analyses, ref, commit_sha)).toEqual([]);
    analyses[3].error = "SARIF processing failed";
    expect(sourceAnalysisBlockers(analyses, ref, commit_sha)).toHaveLength(1);
  });

  it("blocks a failed newest scan even when an older scan of the same source succeeded", () => {
    const ref = "refs/tags/v1.2.3";
    const commit_sha = "a".repeat(40);
    const otherAnalyses = REQUIRED_CODE_ANALYSES.slice(1).map(({ tool, category }) => ({
      ref,
      commit_sha,
      tool: { name: tool },
      category,
      error: "",
      created_at: "2026-10-12T10:00:00Z",
    }));
    const failedLatest = {
      ref,
      commit_sha,
      tool: { name: "CodeQL" },
      category: "/language:csharp",
      error: "SARIF processing failed",
      created_at: "2026-10-12T12:00:00Z",
    };
    const successfulOlder = { ...failedLatest, error: "", created_at: "2026-10-12T11:00:00Z" };
    const expected = ["CodeQL /language:csharp analysis is missing for " + ref + "@" + commit_sha];

    expect(
      sourceAnalysisBlockers([failedLatest, successfulOlder, ...otherAnalyses], ref, commit_sha)
    ).toEqual(expected);
    expect(
      sourceAnalysisBlockers([successfulOlder, failedLatest, ...otherAnalyses], ref, commit_sha)
    ).toEqual(expected);
    expect(
      sourceAnalysisBlockers(
        [
          { ...failedLatest, created_at: "2026-10-12T11:00:00Z" },
          { ...successfulOlder, created_at: "2026-10-12T12:00:00Z" },
          ...otherAnalyses,
        ],
        ref,
        commit_sha
      )
    ).toEqual([]);
  });

  it("blocks CodeQL, Scorecard vulnerability, and low-severity dependency alerts", () => {
    const code = [
      {
        number: 30,
        state: "open",
        tool: { name: "CodeQL" },
        rule: { id: "js/xss" },
        html_url: "codeql-alert",
      },
      {
        number: 93,
        state: "open",
        tool: { name: "Scorecard" },
        rule: { id: "VulnerabilitiesID" },
        html_url: "scorecard-vulnerability",
      },
    ];
    const dependency = { number: 44, state: "open", html_url: "dependency-alert" };
    expect(securityBlockers(code, [dependency], successfulChecks())).toEqual([
      "Open CodeQL alert #30: codeql-alert",
      "Open Scorecard alert #93: scorecard-vulnerability",
      "Open Dependabot alert #44: dependency-alert",
    ]);
  });

  it("keeps non-vulnerability Scorecard maturity and review indicators visible without blocking release", () => {
    const alerts = ["MaintainedID", "CIIBestPracticesID", "CodeReviewID"].map((id, index) => ({
      number: index + 10,
      state: "open",
      tool: { name: "Scorecard" },
      rule: { id },
      html_url: `scorecard-${id}`,
    }));
    expect(securityBlockers(alerts, [], successfulChecks())).toEqual([]);
  });

  it("blocks an open Scorecard branch-protection finding", () => {
    const alert = {
      number: 1,
      state: "open",
      tool: { name: "Scorecard" },
      rule: { id: "BranchProtectionID" },
      html_url: "scorecard-branch-protection",
    };
    expect(securityBlockers([alert], [], successfulChecks())).toEqual([
      "Open Scorecard alert #1: scorecard-branch-protection",
    ]);
  });

  it("fails closed for other and unknown Scorecard findings", () => {
    for (const id of ["TokenPermissionsID", "DangerousWorkflowID", "NewCheckID", undefined]) {
      const alert = {
        number: 94,
        state: "open",
        tool: { name: "Scorecard" },
        rule: { id },
        html_url: "scorecard-other-finding",
      };
      expect(securityBlockers([alert], [], successfulChecks())).toEqual([
        "Open Scorecard alert #94: scorecard-other-finding",
      ]);
    }
  });

  it.each(["failure", "cancelled", "skipped", "neutral", null])(
    "blocks an unsuccessful required scan (%s)",
    (conclusion) => {
      const checks = successfulChecks();
      checks[0].conclusion = conclusion;
      expect(securityBlockers([], [], checks)).toHaveLength(1);
    }
  );

  it("blocks missing and pending scans", () => {
    expect(securityBlockers([], [], [])).toHaveLength(REQUIRED_CHECKS.length);
    const checks = successfulChecks();
    checks[0] = { name: REQUIRED_CHECKS[0], status: "in_progress", conclusion: null };
    expect(securityBlockers([], [], checks)).toEqual(["sca-scan: in_progress"]);
  });

  it("does not let an earlier success override a failed rerun", () => {
    const checks = successfulChecks();
    checks.unshift({ name: REQUIRED_CHECKS[0], status: "completed", conclusion: "failure" });
    expect(securityBlockers([], [], checks)).toEqual(["sca-scan: failure"]);
  });
});
