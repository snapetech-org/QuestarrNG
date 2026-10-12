#!/usr/bin/env node
/* global console, URL, fetch, AbortSignal, Buffer */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const runtime = fileURLToPath(new URL("../.github/npm-runtime/", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(runtime, "package.json"), "utf8"));
const source = manifest.npmSource;

// npm's registry artifact bundles old dependencies that overrides cannot replace.
// Install the separately locked, patched dependency graph, then extract only the
// integrity-checked CLI source. Bundled node_modules never enter the runtime.
execFileSync("npm", ["ci", "--prefix", runtime, "--ignore-scripts", "--no-audit", "--no-fund"], {
  stdio: "inherit",
});
const response = await fetch(source.url, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`npm source download failed: HTTP ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
if (integrity !== source.integrity) throw new Error("npm source integrity mismatch");

const temporary = mkdtempSync(path.join(tmpdir(), "questarr-npm-"));
const cli = path.join(runtime, "node_modules", ".questarr-npm-cli");
try {
  const archivePath = path.join(temporary, "npm.tgz");
  writeFileSync(archivePath, archive);
  rmSync(cli, { recursive: true, force: true });
  mkdirSync(cli, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    archivePath,
    "--directory",
    cli,
    "--strip-components=1",
    "package/bin",
    "package/lib",
    "package/package.json",
    "package/LICENSE",
  ]);
  const installed = JSON.parse(readFileSync(path.join(cli, "package.json"), "utf8"));
  if (installed.version !== source.version) throw new Error("npm source version mismatch");
  const semver = createRequire(path.join(cli, "package.json"))("semver");
  for (const [name, range] of Object.entries(installed.dependencies)) {
    const dependency = JSON.parse(
      readFileSync(path.join(runtime, "node_modules", name, "package.json"), "utf8")
    );
    if (!manifest.devDependencies[name] || !semver.satisfies(dependency.version, range)) {
      throw new Error(`Locked ${name} does not satisfy npm's required range ${range}`);
    }
  }
  const bin = path.join(runtime, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["npm", "npx"]) {
    const target = path.join(bin, name);
    rmSync(target, { force: true });
    symlinkSync(`../.questarr-npm-cli/bin/${name}-cli.js`, target);
  }
  execFileSync(path.join(bin, "npm"), ["--version"], { stdio: "inherit" });
  console.log("Installed integrity-checked npm source with separately locked dependencies.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
