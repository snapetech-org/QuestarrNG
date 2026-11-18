#!/usr/bin/env node
/* global console */
/* global process */
// Flags package.json "overrides" entries that have become redundant: an override exists to
// force a patched version past a vulnerable range still declared by a direct/transitive
// dependency. Once that dependency bumps its own declared range past the patched version,
// the override can be removed. See docs/DEPENDENCIES.md for the rationale behind each entry.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const overrides = pkg.overrides || {};

// Overrides that are necessary for feature support (not just bug patches) and
// may look "removable" because they affect peer dependencies or optional ranges.
// Once the upstream package officially supports the feature, these can be removed.
const necessaryFeatureOverrides = new Set([
  "eslint-plugin-react -> eslint", // ESLint v10 support (eslint-plugin-react@7 doesn't officially support it yet)
]);

const vendoredCacheFix = {
  name: "http-cache-semantics",
  version: "4.2.1-questarr.0",
  upstreamCommit: "11fb104275349bbd84bf21eafd40b18220c29c46",
  testPath: "server/http-cache-semantics.security.test.mjs",
};

function readManifest(dirPath) {
  const manifestPath = path.join(dirPath, "package.json");
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function findGlobalConsumers(pkgName) {
  const consumers = [];
  // Recurse into nested node_modules too: npm doesn't always hoist every copy of a
  // transitive dependency to the top level, so a consumer can be shadowed several
  // levels deep (e.g. node_modules/table/node_modules/ajv) and invisible to a
  // top-level-only scan.
  function walk(nmDir) {
    let entries;
    try {
      entries = readdirSync(nmDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dir of entries) {
      if (!dir.isDirectory() || dir.name === ".bin") continue;
      const dirPath = path.join(nmDir, dir.name);
      if (dir.name.startsWith("@")) {
        let subEntries;
        try {
          subEntries = readdirSync(dirPath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          check(path.join(dirPath, sub.name), `${dir.name}/${sub.name}`);
        }
      } else {
        check(dirPath, dir.name);
      }
    }
  }
  function check(pkgDir, name) {
    const manifest = readManifest(pkgDir);
    const range = manifest?.dependencies?.[pkgName];
    if (range) consumers.push({ consumer: name, range });
    walk(path.join(pkgDir, "node_modules"));
  }
  walk("node_modules");
  return consumers;
}

function findScopedConsumer(parent, pkgName) {
  const manifest = readManifest(path.join("node_modules", ...parent.split("/")));
  const range = manifest?.dependencies?.[pkgName];
  return range ? [{ consumer: parent, range }] : [];
}

const entries = [];
for (const [key, value] of Object.entries(overrides)) {
  if (typeof value === "string") {
    entries.push({ pkgName: key, safeRange: value, parent: null });
  } else if (value && typeof value === "object") {
    for (const [subName, subRange] of Object.entries(value)) {
      entries.push({ pkgName: subName, safeRange: subRange, parent: key });
    }
  }
}

let anyRemovable = false;

for (const { pkgName, safeRange, parent } of entries) {
  const label = parent ? `${parent} -> ${pkgName}` : pkgName;

  // Skip removability check for necessary feature overrides
  if (necessaryFeatureOverrides.has(label)) {
    console.log(
      `[necessary] ${label} (forced ${safeRange}): feature override documented in docs/DEPENDENCIES.md`
    );
    continue;
  }

  const consumers = parent ? findScopedConsumer(parent, pkgName) : findGlobalConsumers(pkgName);

  if (consumers.length === 0) {
    console.log(`[REMOVABLE] ${label} (forced ${safeRange}): no consumer found in node_modules.`);
    anyRemovable = true;
    continue;
  }

  if (label === "picomatch" && safeRange === "npm:@ryotsu/picomatch@4.0.7-a") {
    const entries = Object.entries(lock.packages).filter(
      ([location]) =>
        location.endsWith("/node_modules/picomatch") || location === "node_modules/picomatch"
    );
    const matchesPatchedFork =
      entries.length > 0 &&
      entries.every(
        ([, entry]) => entry.name === "@ryotsu/picomatch" && entry.version === "4.0.7-a"
      );
    if (!matchesPatchedFork) {
      console.error(
        "[invalid] picomatch: the lockfile must resolve every copy to the patched fork."
      );
      anyRemovable = true;
    } else {
      console.log("[still needed] picomatch: pinned to the patched fork for CVE-2026-112366");
    }
    continue;
  }

  const safeMin = semver.minVersion(safeRange);
  const unsafe = consumers.filter((c) => {
    const consumerMin = semver.minVersion(c.range);
    return !consumerMin || semver.lt(consumerMin, safeMin);
  });

  if (unsafe.length === 0) {
    console.log(
      `[REMOVABLE] ${label} (forced ${safeRange}): every consumer's own range is already >= ${safeMin}.`
    );
    for (const c of consumers) console.log(`  - ${c.consumer} wants ${c.range}`);
    anyRemovable = true;
  } else {
    console.log(`[still needed] ${label} (forced ${safeRange})`);
    for (const c of unsafe)
      console.log(`  - ${c.consumer} wants ${c.range} (would allow < ${safeMin})`);
  }
}

const cacheFixLockEntries = Object.keys(lock.packages ?? {}).filter(
  (packagePath) =>
    packagePath === `node_modules/${vendoredCacheFix.name}` ||
    packagePath.endsWith(`/node_modules/${vendoredCacheFix.name}`) ||
    packagePath === `vendor/${vendoredCacheFix.name}`
);
const cacheFixManifest = readManifest(path.join("vendor", vendoredCacheFix.name));
const cacheTestSource = existsSync(vendoredCacheFix.testPath)
  ? readFileSync(vendoredCacheFix.testPath, "utf8")
  : "";
const cacheFixIsValid =
  !overrides[vendoredCacheFix.name] &&
  !pkg.dependencies?.[vendoredCacheFix.name] &&
  !pkg.devDependencies?.[vendoredCacheFix.name] &&
  cacheFixLockEntries.length === 0 &&
  cacheFixManifest?.version === vendoredCacheFix.version &&
  cacheFixManifest?.["x-upstream-commit"] === vendoredCacheFix.upstreamCommit &&
  cacheTestSource.includes('require("../vendor/http-cache-semantics")');

if (!cacheFixIsValid) {
  console.error(
    `[invalid] ${vendoredCacheFix.name}: expected no npm dependency, a reviewed vendored fix, and an active direct-source security regression test.`
  );
  anyRemovable = true;
} else {
  console.log(
    `[reviewed cache fix] ${vendoredCacheFix.name}@${vendoredCacheFix.version} (upstream ${vendoredCacheFix.upstreamCommit}); absent from the npm dependency graph`
  );
}

if (anyRemovable) {
  console.error(
    "\nOne or more dependency overrides are redundant or the local security fork pin is invalid. Review package.json and package-lock.json."
  );
  process.exit(1);
}

console.log(
  "\nAll overrides are still required and the vendored cache fix remains covered by tests."
);
