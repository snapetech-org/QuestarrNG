import fs from "fs-extra";
import path from "node:path";
import { serviceMessageError, type ServiceMessageFragment } from "../shared/service-messages.js";

const SENSITIVE_PATH_PREFIXES = ["/proc", "/sys", "/dev", "/run/secrets", "/etc", "/root"];

// Same prefixes as SENSITIVE_PATH_PREFIXES, as a single regex test.
const SENSITIVE_PATH_REGEX = new RegExp(
  `^(?:${SENSITIVE_PATH_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:/|$)`
);

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
  const resolved = path.resolve(rawPath).replaceAll("\\", "/");
  return SENSITIVE_PATH_REGEX.test(resolved);
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
