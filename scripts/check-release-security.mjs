#!/usr/bin/env node
/* global console, process */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const REQUIRED_CHECKS = [
  "sca-scan",
  "test",
  "windows-service",
  "Build and check on Node 22.19.0",
  "Build and check on Node 26.x",
  "Reconcile test and build node receipts",
  "Analyze (javascript-typescript)",
  "Analyze (csharp)",
  "Analyze (actions)",
  "semgrep",
  "Playwright e2e",
  "OWASP ZAP baseline scan",
  "Scorecard analysis",
  "npm-audit",
  "image-scan",
];

const BLOCKING_SCORECARD_RULES = new Set(["VulnerabilitiesID", "BranchProtectionID"]);

function isBlockingCodeAlert(alert) {
  if (alert.state !== "open") return false;
  if (alert.tool?.name !== "Scorecard") return true;
  return BLOCKING_SCORECARD_RULES.has(alert.rule?.id);
}

export function securityBlockers(codeAlerts, dependencyAlerts, checkRuns) {
  const blockers = [];
  for (const alert of codeAlerts) {
    if (isBlockingCodeAlert(alert)) {
      blockers.push(
        `Open ${alert.tool?.name ?? "code scanning"} alert #${alert.number}: ${alert.html_url}`
      );
    }
  }
  for (const alert of dependencyAlerts) {
    if (alert.state === "open") {
      blockers.push(`Open Dependabot alert #${alert.number}: ${alert.html_url}`);
    }
  }
  for (const name of REQUIRED_CHECKS) {
    // GitHub returns the newest run first. A successful old rerun must not
    // conceal a newer failed or pending run for the same source commit.
    const check = checkRuns.find((run) => run.name === name);
    if (!check || check.status !== "completed" || check.conclusion !== "success") {
      blockers.push(`${name}: ${check?.conclusion ?? check?.status ?? "missing"}`);
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

export function auditReleaseLockfiles(sha) {
  const temporary = mkdtempSync(path.join(tmpdir(), "questarr-release-audit-"));
  try {
    for (const directory of ["", ".github/npm-runtime"]) {
      const target = path.join(temporary, directory);
      mkdirSync(target, { recursive: true });
      for (const filename of ["package.json", "package-lock.json"]) {
        const sourcePath = directory ? `${directory}/${filename}` : filename;
        writeFileSync(
          path.join(target, filename),
          execFileSync("git", ["show", `${sha}:${sourcePath}`])
        );
      }
      execFileSync("npm", ["audit", "--audit-level=low"], { cwd: target, stdio: "inherit" });
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function checkReleaseSecurity(repository, sha) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !/^[a-f0-9]{40}$/.test(sha ?? "")) {
    throw new Error("GITHUB_REPOSITORY and a full RELEASE_SHA (or GITHUB_SHA) are required");
  }
  // Recheck the checked-out tag's lockfiles at publication time: a previously
  // successful scan cannot cover advisories published since that scan ran.
  auditReleaseLockfiles(sha);
  // API failures, including insufficient permissions, throw and block publication.
  const code = pages(
    `repos/${repository}/code-scanning/alerts?state=open&ref=refs%2Fheads%2Fmain&per_page=100`
  ).flat();
  const dependencies = pages(
    `repos/${repository}/dependabot/alerts?state=open&per_page=100`
  ).flat();
  const checks = pages(
    `repos/${repository}/commits/${sha}/check-runs?filter=latest&per_page=100`
  ).flatMap((page) => page.check_runs);
  const blockers = securityBlockers(code, dependencies, checks);
  if (blockers.length)
    throw new Error(`Release blocked:\n${blockers.map((value) => `- ${value}`).join("\n")}`);
  console.log(
    `Security gate passed for ${repository}@${sha}: zero open security findings and all scans successful.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkReleaseSecurity(
      process.env.GITHUB_REPOSITORY,
      process.env.RELEASE_SHA ?? process.env.GITHUB_SHA
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
