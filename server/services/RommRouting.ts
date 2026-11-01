import { ServiceMessageError } from "../../shared/service-messages.js";
import path from "node:path";
import type { RomMBindingMissingBehavior, RomMPlatformRoutingMode } from "../../shared/schema.js";

export interface ResolveRommPlatformDirOptions {
  libraryRoot: string;
  fsSlug: string;
  routingMode: RomMPlatformRoutingMode;
  bindings?: Record<string, string>;
  bindingMissingBehavior?: RomMBindingMissingBehavior;
}

const SLUG_PATTERN = /^[a-z0-9._-]+$/;

function ensureInsideRoot(root: string, candidate: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const inside =
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep);
  if (!inside) {
    throw new ServiceMessageError("service.romm_platform_outside_library", {});
  }
}

export function validateRommSlug(fsSlug: string): string {
  const normalized = fsSlug.trim().toLowerCase();
  if (!normalized) throw new ServiceMessageError("service.romm_slug_required", {});
  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new ServiceMessageError("service.romm_slug_path_separators", {});
  }
  if (normalized.includes("..")) {
    throw new ServiceMessageError("service.romm_slug_traversal", {});
  }
  if (!SLUG_PATTERN.test(normalized)) {
    throw new ServiceMessageError("service.romm_slug_invalid_characters", {});
  }
  return normalized;
}

export function resolveRommPlatformDir(options: ResolveRommPlatformDirOptions): string {
  const { libraryRoot, routingMode, bindings = {}, bindingMissingBehavior = "fallback" } = options;

  const safeSlug = validateRommSlug(options.fsSlug);
  const resolvedRoot = path.resolve(libraryRoot);

  if (routingMode === "binding-map") {
    const rawBinding = bindings[safeSlug];
    if (rawBinding && rawBinding.trim()) {
      const bindingPath = path.resolve(resolvedRoot, rawBinding.trim());
      ensureInsideRoot(resolvedRoot, bindingPath);
      return bindingPath;
    }

    if (bindingMissingBehavior === "error") {
      throw new ServiceMessageError("service.romm_binding_missing", { slug: safeSlug });
    }
  }

  const slugDir = path.resolve(resolvedRoot, safeSlug);
  ensureInsideRoot(resolvedRoot, slugDir);
  return slugDir;
}

export function sanitizeFsName(name: string): string {
  return name
    .replaceAll(/[\\/:*?"<>|]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}
