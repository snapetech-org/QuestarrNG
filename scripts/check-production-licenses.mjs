#!/usr/bin/env node
/* global console */
/* global process */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const allowedLicenses = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "CC0-1.0",
  "0BSD",
  "Python-2.0",
  "PSF-2.0",
  "BlueOak-1.0.0",
  "OFL-1.1",
  "Unlicense",
  "GPL-3.0",
  "GPL-3.0-only",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "LGPL-3.0",
  "LGPL-3.0-only",
  "MPL-2.0",
]);

function tokenize(expression) {
  const tokens = expression.match(/[A-Za-z0-9.+:-]+|[()]/g) ?? [];
  if (tokens.join("").length !== expression.replace(/\s/g, "").length) {
    throw new Error(`Unsupported SPDX expression: ${expression}`);
  }
  return tokens;
}

function parseExpression(expression) {
  const tokens = tokenize(expression);
  let cursor = 0;

  function parsePrimary() {
    if (tokens[cursor] === "(") {
      cursor += 1;
      const alternatives = parseOr();
      if (tokens[cursor] !== ")") throw new Error(`Unbalanced SPDX expression: ${expression}`);
      cursor += 1;
      return alternatives;
    }

    const license = tokens[cursor++];
    if (!license || ["AND", "OR", "WITH", ")"].includes(license)) {
      throw new Error(`Invalid SPDX expression: ${expression}`);
    }

    if (tokens[cursor] === "WITH") {
      cursor += 1;
      const exception = tokens[cursor++];
      if (!exception || ["AND", "OR", "WITH", ")"].includes(exception)) {
        throw new Error(`Invalid SPDX exception in: ${expression}`);
      }
      return [[`${license} WITH ${exception}`]];
    }

    return [[license]];
  }

  function parseAnd() {
    let combinations = parsePrimary();
    while (tokens[cursor] === "AND") {
      cursor += 1;
      const right = parsePrimary();
      combinations = combinations.flatMap((left) => right.map((branch) => [...left, ...branch]));
    }
    return combinations;
  }

  function parseOr() {
    let alternatives = parseAnd();
    while (tokens[cursor] === "OR") {
      cursor += 1;
      alternatives = [...alternatives, ...parseAnd()];
    }
    return alternatives;
  }

  const alternatives = parseOr();
  if (cursor !== tokens.length) throw new Error(`Invalid SPDX expression: ${expression}`);
  return alternatives;
}

export function isLicenseExpressionAllowed(expression, allowList = allowedLicenses) {
  if (typeof expression !== "string" || expression.trim() === "") return false;

  try {
    const normalizedExpression = expression.replace(/([A-Za-z0-9.+:-]+)\*/g, "$1");
    return parseExpression(normalizedExpression).some((branch) =>
      branch.every((license) => allowList.has(license.replace(/\*$/, "")))
    );
  } catch {
    return false;
  }
}

function expressionsFromPackage(pkg) {
  const expressions = [];
  if (typeof pkg.license === "string") expressions.push(pkg.license);

  if (Array.isArray(pkg.licenses)) {
    for (const license of pkg.licenses) {
      if (typeof license === "string") expressions.push(license);
      else if (typeof license?.type === "string") expressions.push(license.type);
      else if (typeof license?.id === "string") expressions.push(license.id);
    }
  }

  return [...new Set(expressions)];
}

export function checkLicensePackages(packages, resolveMissingLicense = () => null) {
  const issues = [];
  const inferred = [];

  for (const pkg of packages) {
    let expressions = expressionsFromPackage(pkg);

    if (expressions.length === 0) {
      const fallback = resolveMissingLicense(pkg);
      expressions = Array.isArray(fallback) ? fallback : fallback ? [fallback] : [];
      if (expressions.length > 0) inferred.push({ pkg, expressions });
    }

    if (expressions.length === 0) {
      issues.push({ pkg, reason: "no license metadata or recognizable license file" });
      continue;
    }

    const rejected = expressions.filter((expression) => !isLicenseExpressionAllowed(expression));
    if (rejected.length > 0)
      issues.push({ pkg, reason: `disallowed license: ${rejected.join("; ")}` });
  }

  return { issues, inferred };
}

export function licenseFromText(text) {
  if (/\b(?:the\s+)?MIT License\b/i.test(text)) return "MIT*";

  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  if (
    normalized.includes(
      "permission is hereby granted, free of charge, to any person obtaining a copy"
    ) &&
    normalized.includes(
      "without restriction, including without limitation the rights to use, copy, modify, merge, publish"
    ) &&
    normalized.includes("the above copyright notice and this permission notice shall be included")
  ) {
    return "MIT*";
  }

  return null;
}

function packageNameFromLockPath(lockPath) {
  const marker = lockPath.lastIndexOf("node_modules/");
  return marker < 0 ? null : lockPath.slice(marker + "node_modules/".length);
}

function readPackageLicenseFile(packageDir) {
  let names;
  try {
    names = readdirSync(packageDir);
  } catch {
    return null;
  }

  const candidates = names.filter(
    (name) =>
      /^(?:license|licence|copying)(?:[._-].*)?$/i.test(name) || /^readme(?:[._-].*)?$/i.test(name)
  );

  for (const name of candidates) {
    const filePath = path.join(packageDir, name);
    try {
      if (statSync(filePath).size > 2 * 1024 * 1024) continue;
      const expression = licenseFromText(readFileSync(filePath, "utf8"));
      if (expression) return { expression, file: name };
    } catch {
      // Ignore unreadable package metadata; the missing-license policy reports it below.
    }
  }

  return null;
}

export function inferInstalledLicense(component, lock, rootDir = process.cwd()) {
  const matches = Object.entries(lock.packages ?? {}).filter(
    ([lockPath, entry]) =>
      lockPath.startsWith("node_modules/") &&
      packageNameFromLockPath(lockPath) === component.name &&
      entry.version === component.version
  );

  for (const [lockPath, entry] of matches) {
    const fromLock = entry.license;
    if (typeof fromLock === "string" && fromLock.trim())
      return { expression: fromLock, source: "package-lock.json" };

    const packageDir = path.resolve(rootDir, lockPath);
    const root = path.resolve(rootDir);
    if (packageDir !== root && !packageDir.startsWith(`${root}${path.sep}`)) continue;
    const manifestPath = path.join(packageDir, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (typeof manifest.license === "string" && manifest.license.trim()) {
          return { expression: manifest.license, source: `${lockPath}/package.json` };
        }
      } catch {
        // Fall through to the license-file check and report a missing license if needed.
      }
    }

    const detected = readPackageLicenseFile(packageDir);
    if (detected) return { ...detected, source: `${lockPath}/${detected.file}` };
  }

  return null;
}

function runNpmProductionQuery() {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : "npm";
  const args = npmCli ? [npmCli, "query", ".prod", "--json"] : ["query", ".prod", "--json"];
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `npm query .prod exited with status ${result.status}`);
  return JSON.parse(result.stdout);
}

export function main() {
  const lockPath = path.resolve("package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const packages = runNpmProductionQuery();
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error("npm query .prod returned no production packages");
  }

  const { issues, inferred } = checkLicensePackages(packages, (pkg) => {
    const found = inferInstalledLicense(pkg, lock);
    return found ? found.expression : null;
  });

  for (const { pkg, expressions } of inferred) {
    console.log(`[inferred] ${pkg.name}@${pkg.version}: ${expressions.join("; ")}`);
  }

  for (const issue of issues) {
    console.error(`[disallowed] ${issue.pkg.name}@${issue.pkg.version}: ${issue.reason}`);
  }

  if (issues.length > 0) process.exitCode = 1;
  else
    console.log(
      `Checked ${new Set(packages.map((pkg) => `${pkg.name}@${pkg.version}`)).size} production package versions; all licenses are allowed.`
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`Production license check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
