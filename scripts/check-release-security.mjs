#!/usr/bin/env node
/* global console, process */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
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

export const REQUIRED_CODE_ANALYSES = [
  { tool: "CodeQL", category: "/language:csharp" },
  { tool: "CodeQL", category: "/language:javascript-typescript" },
  { tool: "CodeQL", category: "/language:actions" },
  { tool: "Semgrep OSS", category: ".github/workflows/sast.yml:semgrep" },
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
    // Scorecard is checked against the default branch below; the source tag
    // scans are CodeQL and Semgrep, and must fail closed if their ref differs.
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

export function sourceAnalysisBlockers(analyses, releaseRef, releaseSha) {
  const sourceAnalyses = analyses.filter(
    (analysis) => analysis.ref === releaseRef && analysis.commit_sha === releaseSha
  );
  return REQUIRED_CODE_ANALYSES.filter((required) => {
    const matchingAnalyses = sourceAnalyses.filter(
      (analysis) =>
        analysis.tool?.name?.toLowerCase() === required.tool.toLowerCase() &&
        (required.category === undefined || analysis.category === required.category)
    );
    // A rerun can leave an older success, so require the newest exact-source analysis.
    if (
      matchingAnalyses.some((analysis) => !Number.isFinite(Date.parse(analysis.created_at ?? "")))
    ) {
      return true;
    }
    const latestAnalysis = matchingAnalyses.reduce((latest, analysis) => {
      const latestCreated = Date.parse(latest.created_at ?? "");
      const analysisCreated = Date.parse(analysis.created_at ?? "");
      if (analysisCreated !== latestCreated) {
        return analysisCreated > latestCreated ? analysis : latest;
      }
      return Number(analysis.id) > Number(latest.id) ? analysis : latest;
    }, matchingAnalyses[0]);
    return !latestAnalysis || latestAnalysis.error !== "";
  }).map((required) => {
    const category = required.category ? " " + required.category : "";
    return required.tool + category + " analysis is missing for " + releaseRef + "@" + releaseSha;
  });
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

async function waitForReleaseScans(repository, releaseRef, releaseSha) {
  const deadline = Date.now() + SOURCE_SCAN_WAIT_MS;
  let didLogWaiting = false;
  while (true) {
    const refQuery = encodeURIComponent(releaseRef);
    const analyses = flattenedPages(
      "repos/" + repository + "/code-scanning/analyses?ref=" + refQuery + "&per_page=100"
    );
    const checkRuns = flattenedPages(
      "repos/" + repository + "/commits/" + releaseSha + "/check-runs?filter=latest&per_page=100"
    ).flatMap((page) => page.check_runs ?? []);
    const missingAnalyses = sourceAnalysisBlockers(analyses, releaseRef, releaseSha);
    const checkProblems = securityBlockers([], [], checkRuns);
    if (missingAnalyses.length === 0 && checkProblems.length === 0) return checkRuns;

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
      const blockers = [...missingAnalyses, ...checkProblems];
      throw new Error(
        "Release source scans did not finish before timeout:" +
          String.fromCharCode(10) +
          blockers.map((problem) => "- " + problem).join(String.fromCharCode(10))
      );
    }
    if (!didLogWaiting) {
      console.log(
        "Waiting for CodeQL, Semgrep, and required checks on " + releaseRef + "@" + releaseSha + "."
      );
      didLogWaiting = true;
    }
    await delay(SOURCE_SCAN_POLL_MS);
  }
}

export function auditReleaseLockfiles(sha) {
  const temporary = mkdtempSync(path.join(tmpdir(), "questarr-release-audit-"));
  try {
    for (const directory of ["", ".github/npm-runtime", ".github/npm-source"]) {
      const target = path.join(temporary, directory);
      mkdirSync(target, { recursive: true });
      for (const filename of ["package.json", "package-lock.json"]) {
        const sourcePath = directory ? directory + "/" + filename : filename;
        writeFileSync(
          path.join(target, filename),
          execFileSync("git", ["show", sha + ":" + sourcePath])
        );
      }
      execFileSync("npm", ["audit", "--audit-level=low"], { cwd: target, stdio: "inherit" });
    }
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
  // Check the exact tagged source, and wait until its tag-specific SAST analyses
  // exist so an empty alert response cannot be mistaken for a completed clean scan.
  const checks = await waitForReleaseScans(repository, releaseRef, sha);
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
      ": zero open security findings and all scans successful."
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
