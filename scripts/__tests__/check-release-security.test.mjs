import { describe, expect, it } from "vitest";
import { REQUIRED_CHECKS, securityBlockers } from "../check-release-security.mjs";

const successfulChecks = () =>
  REQUIRED_CHECKS.map((name) => ({
    name,
    status: "completed",
    conclusion: "success",
  }));

describe("release security gate", () => {
  it("permits a clean source commit only after every required scan succeeds", () => {
    expect(securityBlockers([], [], successfulChecks())).toEqual([]);
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
