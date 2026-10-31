#!/usr/bin/env node
/* global console, process */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const REQUIRED_CHECKS = [
  "sca-scan",
  "test",
  "windows-service",
  "Build and check on Node 22.23.4",
  "Build and check on Node 26.x",
  "semgrep",
  "Playwright e2e",
  "OWASP ZAP baseline scan",
  "Scorecard analysis",
  "npm-audit",
  "image-scan",
];

const INFORMATIONAL_SCORECARD_RULES = new Set([
  "MaintainedID",
  "CIIBestPracticesID",
  "CodeReviewID",
]);
const SOURCE_SCAN_WAIT_MS = 30 * 60 * 1000;
const SOURCE_SCAN_POLL_MS = 15 * 1000;

function isBlockingCodeAlert(alert, releaseRef) {
  const instance = alert.most_recent_instance;
  if (releaseRef && instance?.ref !== releaseRef) {
    // Scorecard is checked against the default branch below; other source
    // alerts must match the release ref so stale findings cannot be ignored.
    return alert.tool?.name !== "Scorecard";
  }
  const state = instance?.state ?? alert.state;
  if (state !== "open") return false;
  if (alert.tool?.name !== "Scorecard") return true;
  return !INFORMATIONAL_SCORECARD_RULES.has(alert.rule?.id);
}

export function securityBlockers(codeAlerts, dependencyAlerts, checkRuns = null, releaseRef) {
  const blockers = [];
  for (const alert of codeAlerts) {
    if (isBlockingCodeAlert(alert, releaseRef)) {
      blockers.push(
        "Open " +
          (alert.tool?.name ?? "code scanning") +
          " alert #" +
          alert.number +
          ": " +
          alert.html_url
      );
    }
  }
  for (const alert of dependencyAlerts) {
    if (alert.state === "open") {
      blockers.push("Open Dependabot alert #" + alert.number + ": " + alert.html_url);
    }
  }
  if (checkRuns !== null) {
    for (const name of REQUIRED_CHECKS) {
      // GitHub returns the newest run first. A successful old rerun must not
      // conceal a newer failed or pending run for the same source commit.
      const check = checkRuns.find((run) => run.name === name);
      if (!check || check.status !== "completed" || check.conclusion !== "success") {
        blockers.push(name + ": " + (check?.conclusion ?? check?.status ?? "missing"));
      }
    }
  }
  return blockers;
}

function pages(endpoint) {
  return JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", endpoint], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
  );
}

function flattenedPages(endpoint) {
  return pages(endpoint).flat();
}

async function waitForRequiredChecks(repository, releaseRef, releaseSha) {
  const deadline = Date.now() + SOURCE_SCAN_WAIT_MS;
  let didLogWaiting = false;
  while (true) {
    const checkRuns = flattenedPages(
      "repos/" + repository + "/commits/" + releaseSha + "/check-runs?filter=latest&per_page=100"
    ).flatMap((page) => page.check_runs ?? []);
    const checkProblems = securityBlockers([], [], checkRuns);
    if (checkProblems.length === 0) return checkRuns;

    const terminalCheckProblems = checkProblems.filter((problem) => {
      const state = problem.slice(problem.lastIndexOf(":") + 1).trim();
      return !["missing", "queued", "in_progress"].includes(state);
    });
    if (terminalCheckProblems.length > 0) {
      throw new Error(
        "Release source checks failed:" +
          String.fromCharCode(10) +
          terminalCheckProblems.map((problem) => "- " + problem).join(String.fromCharCode(10))
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "Release source scans did not finish before timeout:" +
          String.fromCharCode(10) +
          checkProblems.map((problem) => "- " + problem).join(String.fromCharCode(10))
      );
    }
    if (!didLogWaiting) {
      console.log(
        "Waiting for configured release checks on " + releaseRef + "@" + releaseSha + "."
      );
      didLogWaiting = true;
    }
    await delay(SOURCE_SCAN_POLL_MS);
  }
}

export function auditReleaseLockfiles(sha) {
  const temporary = mkdtempSync(path.join(tmpdir(), "questarr-release-audit-"));
  try {
    for (const filename of ["package.json", "package-lock.json"]) {
      writeFileSync(
        path.join(temporary, filename),
        execFileSync("git", ["show", sha + ":" + filename])
      );
    }
    execFileSync("npm", ["audit", "--audit-level=low"], { cwd: temporary, stdio: "inherit" });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export async function checkReleaseSecurity(repository, sha, releaseRef) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(sha ?? "") ||
    !/^refs\/tags\/v\d+\.\d+\.\d+$/.test(releaseRef ?? "")
  ) {
    throw new Error(
      "GITHUB_REPOSITORY, a full release SHA, and RELEASE_REF (refs/tags/vMAJOR.MINOR.PATCH) are required"
    );
  }
  // Wait for required checks on the exact tagged source commit before evaluating alerts.
  const checks = await waitForRequiredChecks(repository, releaseRef, sha);
  // A previously successful scan cannot cover advisories published since it ran.
  auditReleaseLockfiles(sha);
  // API failures, including insufficient permissions, throw and block publication.
  const encodedRef = encodeURIComponent(releaseRef);
  const codeOnDefaultBranch = flattenedPages(
    "repos/" + repository + "/code-scanning/alerts?state=open&per_page=100"
  );
  const codeOnReleaseSource = flattenedPages(
    // The top-level alert state may be fixed on main while this tag's instance
    // is still open. Fetch every tag alert and assess its ref-specific instance.
    "repos/" + repository + "/code-scanning/alerts?ref=" + encodedRef + "&per_page=100"
  );
  const dependencies = flattenedPages(
    "repos/" + repository + "/dependabot/alerts?state=open&per_page=100"
  );
  const blockers = [
    ...new Set([
      ...securityBlockers(codeOnDefaultBranch, [], checks),
      ...securityBlockers(codeOnReleaseSource, [], null, releaseRef),
      ...securityBlockers([], dependencies, null),
    ]),
  ];
  if (blockers.length) {
    throw new Error(
      "Release blocked:" +
        String.fromCharCode(10) +
        blockers.map((value) => "- " + value).join(String.fromCharCode(10))
    );
  }
  console.log(
    "Security gate passed for " +
      repository +
      "@" +
      sha +
      " on " +
      releaseRef +
      ": zero open security findings and all configured checks successful."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkReleaseSecurity(
      process.env.GITHUB_REPOSITORY,
      process.env.RELEASE_SHA ?? process.env.GITHUB_SHA,
      process.env.RELEASE_REF ?? process.env.GITHUB_REF
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
