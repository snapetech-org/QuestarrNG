#!/usr/bin/env python3
"""Verify the committed QuestarrNG PR #155 catalog coverage addendum."""
from __future__ import annotations
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
AUDIT = ROOT / "docs/pr-evidence/pr155-localization-2026-11-02/catalog-reconciliation-audit-2026-11-02.md"
AUDIT_SUMS = ROOT / "docs/pr-evidence/pr155-localization-2026-11-02/SHA256SUMS"
SOURCE_COVERAGE = ROOT / "localization/source-coverage.json"
PIN_HEAD = "0ea966692f4dec72e8830ebc1f085549968c587e"
PIN_TREE = "edc78b5261b481ab8afd044df8371bb21f5d4d14"
AUDIT_SHA = "e0033a66c3f61ab750041ff97d2944c3e649134c7adb48d754bea14fe66c1ca6"
AUDIT_SUMS_SHA = "cd98ea36c0c37f51bd391409c14b5b93faf5241debc4db7d5104b59d886be0be"
SOURCE_COVERAGE_SHA = "8067518d6eb7148470897d6dfa346f2893e6de7465e049b91b6d8b13fb300bfb"
TARGET_PREFIX = "docs/pr-evidence/pr155-localization-2026-11-03/current-head-coverage/"

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("FAIL: " + message)

att = json.loads((HERE / "coverage-attestation.json").read_text(encoding="utf-8"))
compare = json.loads((HERE / "audit-to-input-head-compare.json").read_text(encoding="utf-8"))
readme = (HERE / "README.md").read_text(encoding="utf-8")
check(att["prState"]["inputHead"] == PIN_HEAD, "input head pin")
check(att["prState"]["inputTree"] == PIN_TREE, "input tree pin")
check(att["audit"]["auditHead"] == "47e57bdff5918e6444417d140511b3f2713cf7fd", "audit head pin")
check(att["audit"]["sha256"] == AUDIT_SHA and sha(AUDIT) == AUDIT_SHA, "audit document hash")
check(att["audit"]["checksumListSha256"] == AUDIT_SUMS_SHA and sha(AUDIT_SUMS) == AUDIT_SUMS_SHA, "audit checksum-list hash")
check(AUDIT_SHA in AUDIT_SUMS.read_text(encoding="utf-8"), "audit checksum-list entry")
check(sha(SOURCE_COVERAGE) == SOURCE_COVERAGE_SHA, "current source-coverage metadata hash")
cov = att["coverage"]
check(len(cov["directLocales"]) == 12 and cov["directLocaleCount"] == 12, "12 direct locales")
check(cov["canonicalSourceIds"] == 2590 and cov["directCellsPerLocale"] == 2590, "per-locale direct count")
check(cov["directCells"] == cov["canonicalSourceIds"] * cov["directLocaleCount"] == 31080, "direct cell total")
check(cov["formalReviewRecords"] == cov["resolvedFormalReviewRecords"] == 36960, "formal review resolution")
check(cov["domainContextRecords"] == 5880 and cov["activeUnresolvedRecords"] == 0, "domain/context and unresolved counts")
check(cov["deterministicUncoveredSemanticSlice"] is False, "uncovered-slice disposition")
files = compare.get("files", [])
loc = [path for path in files if path.startswith("localization/")]
check(loc == ["localization/source-coverage.json"], "localization compare paths")
check(att["currentHeadComparison"]["localeCatalogPathsChanged"] == [], "no locale catalog changes")
check(att["currentHeadComparison"]["exactCatalogCoverageCarriesForward"] is True, "catalog coverage carry-forward")
check("no deterministic uncovered semantic slice" in AUDIT.read_text(encoding="utf-8").lower(), "audit coverage conclusion")
for phrase in ("native-speaker", "mobile", "rtl", "populated provider", "private-jit"):
    check(phrase in readme.lower(), "pending gate documented: " + phrase)
check("blocked" not in readme.lower(), "report frames coverage status without rollout-blocked wording")
check(att["testsBuildsScansCi"] == "not run" and att["workflowChanges"] is False, "scope statement")

head = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
tree = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD^{tree}"], text=True).strip()
if head == PIN_HEAD:
    changed = []
elif subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "HEAD^"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode == 0:
    parent = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD^"], text=True).strip()
    check(parent == PIN_HEAD, "current commit parent is pinned input head")
    changed = subprocess.check_output(["git", "-C", str(ROOT), "diff", "--name-only", PIN_HEAD, "HEAD"], text=True).splitlines()
    check(all(path.startswith(TARGET_PREFIX) for path in changed), "commit changes confined to evidence directory")
else:
    raise SystemExit("FAIL: HEAD is neither attested input nor its docs-only child")

result = {
    "result": "PASS",
    "attestedInputHead": PIN_HEAD,
    "attestedInputTree": PIN_TREE,
    "workingHead": head,
    "workingTree": tree,
    "auditSha256": sha(AUDIT),
    "auditChecksumListSha256": sha(AUDIT_SUMS),
    "currentSourceCoverageSha256": sha(SOURCE_COVERAGE),
    "sourceIds": cov["canonicalSourceIds"],
    "locales": cov["directLocaleCount"],
    "directCells": cov["directCells"],
    "resolvedReviewRecords": cov["resolvedFormalReviewRecords"],
    "activeUnresolvedRecords": cov["activeUnresolvedRecords"],
    "compareLocalizationPaths": loc,
    "catalogPathsChanged": att["currentHeadComparison"]["localeCatalogPathsChanged"],
    "postInputCommitPaths": changed
}
print(json.dumps(result, indent=2, sort_keys=True))
