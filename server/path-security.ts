import fs from "fs-extra";
import fsSync from "node:fs";
import path from "node:path";
import { serviceMessageError, type ServiceMessageFragment } from "../shared/service-messages.js";

const SENSITIVE_PATH_PREFIXES = ["/proc", "/sys", "/dev", "/run/secrets", "/etc", "/root"];

// Same prefixes as SENSITIVE_PATH_PREFIXES, as a single regex test.
const SENSITIVE_PATH_REGEX = new RegExp(
  `^(?:${SENSITIVE_PATH_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:/|$)`
);
const WINDOWS_SENSITIVE_PATH_PREFIXES = [
  process.env.SystemRoot,
  process.env.WINDIR,
  process.env.ProgramFiles,
  process.env["ProgramFiles(x86)"],
  `${process.env.SystemDrive ?? "C:"}\\Windows`,
]
  .filter((value): value is string => Boolean(value))
  .map((value) => path.win32.resolve(value).toLowerCase());

function isWindowsSensitivePath(candidatePath: string): boolean {
  const isWindowsPath =
    process.platform === "win32" ||
    /^[a-z]:[\\/]/i.test(candidatePath) ||
    candidatePath.startsWith("\\\\");
  if (!isWindowsPath) return false;

  const candidate = path.win32.resolve(candidatePath).toLowerCase();
  return WINDOWS_SENSITIVE_PATH_PREFIXES.some((root) => {
    const relative = path.win32.relative(root, candidate);
    return (
      relative === "" ||
      (relative !== ".." &&
        !relative.startsWith(`..${path.win32.sep}`) &&
        !path.win32.isAbsolute(relative))
    );
  });
}

async function canonicalizeConfiguredRoot(root: string): Promise<string> {
  let existingPath = root;
  const missingSegments: string[] = [];
  while (true) {
    try {
      const canonicalExistingPath = await fs.realpath(existingPath);
      return path.join(canonicalExistingPath, ...missingSegments);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = path.dirname(existingPath);
      if (parent === existingPath) throw error;
      missingSegments.unshift(path.basename(existingPath));
      existingPath = parent;
    }
  }
}

/**
 * Returns true if the given path resolves to a sensitive system directory.
 * Resolves the path before comparing so traversal tricks like /data/../etc are caught.
 */
export function isSensitivePath(rawPath: string): boolean {
  if (isWindowsSensitivePath(rawPath)) return true;
  const resolved = path.resolve(rawPath);
  const lexicalPath = resolved.replaceAll("\\", "/");
  if (SENSITIVE_PATH_REGEX.test(lexicalPath) || isWindowsSensitivePath(resolved)) return true;

  // A lexical path check misses an innocuous-looking symlink such as
  // /downloads/credentials -> /etc/shadow. Resolve the deepest existing ancestor
  // so paths with not-yet-created suffixes receive the same protection.
  let existingPath = resolved;
  const missingSegments: string[] = [];
  while (true) {
    try {
      const canonical = fsSync.realpathSync.native(existingPath);
      const canonicalCandidate = path.join(canonical, ...missingSegments).replaceAll("\\", "/");
      return SENSITIVE_PATH_REGEX.test(canonicalCandidate) || isWindowsSensitivePath(canonical);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        // If the canonical target cannot be established, deny processing rather
        // than assuming an inaccessible or cyclic path is harmless.
        return true;
      }
      const parent = path.dirname(existingPath);
      if (parent === existingPath) return true;
      missingSegments.unshift(path.basename(existingPath));
      existingPath = parent;
    }
  }
}

/**
 * Returns the canonical candidate only when it resolves inside one of the configured
 * roots. Walking up to the deepest existing ancestor also handles paths whose final
 * components do not exist yet, while still resolving symlinks in every existing
 * component before accepting the path.
 */
export async function assertWithinRoots(
  candidatePath: string,
  roots: string[],
  errorMessage: string | ServiceMessageFragment
): Promise<string> {
  // No path mappings means the downloader's local path is trusted wholesale; callers
  // intentionally preserve that existing configuration mode.
  if (roots.length === 0) return path.resolve(candidatePath);

  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoots = roots.map((root) => path.resolve(root));

  // Written inline — not delegated to isContainedIn() above — because this check
  // directly gates the fs.realpath() call that follows in the same branch. It's also
  // nested inside that branch, rather than recording a match and continuing after the
  // loop: CodeQL's path-injection sanitizer for the path.relative(root, x) +
  // !startsWith("..")/!isAbsolute() shape only extends its "x is safe here" guarantee
  // to code it can prove is dominated by the guarded branch, in the same function as
  // the sink; a helper call or a loop's break edge don't qualify.
  for (const root of resolvedRoots) {
    const relative = path.relative(root, resolvedCandidate);
    if (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) {
      // Resolve the candidate when it exists. For a not-yet-created suffix, walk up
      // to the deepest existing ancestor so a symlink anywhere in the path is still
      // followed and checked before the missing suffix is re-appended.
      let existingPath = resolvedCandidate;
      const missingSegments: string[] = [];
      let canonicalExistingPath: string;
      while (true) {
        try {
          canonicalExistingPath = await fs.realpath(existingPath);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
          const parent = path.dirname(existingPath);
          if (parent === existingPath) throw error;
          missingSegments.unshift(path.basename(existingPath));
          existingPath = parent;
        }
      }

      const canonicalCandidate = path.join(canonicalExistingPath, ...missingSegments);
      const canonicalRoot = await canonicalizeConfiguredRoot(root);
      const canonicalRelative = path.relative(canonicalRoot, canonicalCandidate);
      if (
        canonicalRelative !== ".." &&
        !canonicalRelative.startsWith(".." + path.sep) &&
        !path.isAbsolute(canonicalRelative)
      ) {
        return canonicalCandidate;
      }
      throw typeof errorMessage === "string"
        ? new Error(errorMessage)
        : serviceMessageError(errorMessage);
    }
  }
  throw typeof errorMessage === "string"
    ? new Error(errorMessage)
    : serviceMessageError(errorMessage);
}
