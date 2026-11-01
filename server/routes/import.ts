import { Router } from "express";
import { persistedServiceMessage } from "../../shared/service-messages.js";
import { storage } from "../storage.js";
import { importManager, pathMappingService, platformMappingService } from "../services/index.js";
import {
  ARCHIVE_PASSWORD_REQUIRED_PREFIX,
  IncompleteScanError,
} from "../services/ImportManager.js";
import { ArchivePasswordRequiredError } from "../services/ArchiveService.js";
import { routesLogger as logger } from "../logger.js";
import { rescanAllEnabledRootFolders } from "../library-scanner.js";
import { validate } from "../middleware.js";

import z from "zod";
import {
  insertPathMappingSchema,
  insertPlatformMappingSchema,
  type InsertPlatformMapping,
  updatePathMappingSchema,
  importTransferModeSchema,
  IMPORT_TRANSFER_MODES,
  GAME_LINK_REQUIRED_STATUS,
  rommConfigSchema,
} from "../../shared/schema.js";
import path from "node:path";
import fs from "fs-extra";
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { extractHostnameFromUrl } from "../url-utils.js";

export const importRouter = Router();

function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(", ");
}

importRouter.use((req, res, next) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.locals.userId = req.user.id;
  return next();
});

const importConfigPatchSchema = z
  .object({
    enablePostProcessing: z.boolean().optional(),
    autoUnpack: z.boolean().optional(),
    renamePattern: z.string().min(1).max(200).optional(),
    overwriteExisting: z.boolean().optional(),
    transferMode: importTransferModeSchema.optional(),
    importPlatformIds: z.array(z.number().int().min(1)).optional(),
    ignoredExtensions: z.array(z.string().min(1)).optional(),
    minFileSize: z.number().int().min(0).optional(),
    libraryRoot: z.string().min(1).max(1024).optional(),
    autoDeleteAfterImport: z.boolean().optional(),
    sortExtras: z.boolean().optional(),
  })
  .strict();

const platformMappingPatchSchema = z
  .object({
    sourcePlatformName: z.string().min(1).max(100).optional(),
    rommPlatformSlug: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();

// The earlier RomM client sent this fixed default even though placement for
// multi-file games is now implicit. Accept that one legacy field so a stale
// client can save the rest of its settings; keep rejecting other unknown keys.
const rommConfigPatchSchema = z.preprocess((value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const patch = value as Record<string, unknown>;
  if (patch.multiFilePlacement !== "subfolder") return value;

  const normalized = { ...patch };
  delete normalized.multiFilePlacement;
  return normalized;
}, rommConfigSchema.partial().strict());

const linkGameDownloadBodySchema = z.object({ gameId: z.string().min(1) }).strict();

const confirmImportBodySchema = z
  .object({
    strategy: z.enum(["pc", "romm"] as const),
    proposedPath: z.string(),
    originalPath: z.string().optional(),
    transferMode: z.enum(IMPORT_TRANSFER_MODES).optional(),
    unpack: z.boolean().optional(),
    password: z
      .string()
      .max(1024)
      .refine((value) => !value.includes("\0"), "Password must not contain null characters")
      .optional(),
  })
  .strict();

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate.startsWith(resolvedRoot + path.sep);
}

function resolveProposedPathWithinRoot(libraryRoot: string, rawPath: string): string {
  if (rawPath.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    throw new Error("Invalid proposed path");
  }

  const resolvedRoot = path.resolve(libraryRoot);
  const resolvedTarget = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(resolvedRoot, path.normalize(rawPath).replace(/^[/\\]+/, ""));

  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw new Error("Invalid proposed path");
  }

  return resolvedTarget;
}

function parseHostFromUrl(url?: string | null): string | null {
  return extractHostnameFromUrl(url);
}

async function checkHardlinkPair(
  sourcePath: string,
  targetPath: string
): Promise<{
  sourcePath: string;
  targetPath: string;
  supported: boolean;
  sameDevice: boolean;
  reason?: string;
}> {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedTarget = path.resolve(targetPath);

  let sourceStats: Stats;
  let targetStats: Stats;

  try {
    sourceStats = await fs.stat(resolvedSource);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    return {
      sourcePath: resolvedSource,
      targetPath: resolvedTarget,
      supported: false,
      sameDevice: false,
      reason: `Source path is not accessible (${code})`,
    };
  }

  try {
    targetStats = await fs.stat(resolvedTarget);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    return {
      sourcePath: resolvedSource,
      targetPath: resolvedTarget,
      supported: false,
      sameDevice: false,
      reason: `Target path is not accessible (${code})`,
    };
  }

  const sourceDir = sourceStats.isDirectory() ? resolvedSource : path.dirname(resolvedSource);
  const targetDir = targetStats.isDirectory() ? resolvedTarget : path.dirname(resolvedTarget);

  const sameDevice = sourceStats.dev === targetStats.dev;
  if (!sameDevice) {
    return {
      sourcePath: sourceDir,
      targetPath: targetDir,
      supported: false,
      sameDevice,
      reason: "Source and target are on different filesystems/devices",
    };
  }

  const probeSource = path.join(targetDir, `.questarr-hardlink-check-src-${randomUUID()}`);
  const probeLink = path.join(targetDir, `.questarr-hardlink-check-link-${randomUUID()}`);

  try {
    await fs.writeFile(probeSource, "questarr-hardlink-check");
    await fs.link(probeSource, probeLink);
    return {
      sourcePath: sourceDir,
      targetPath: targetDir,
      supported: true,
      sameDevice,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    return {
      sourcePath: sourceDir,
      targetPath: targetDir,
      supported: false,
      sameDevice,
      reason: `Hardlink probe failed (${code})`,
    };
  } finally {
    await fs.remove(probeLink).catch(() => undefined);
    await fs.remove(probeSource).catch(() => undefined);
  }
}

// --- Mappings Management ---

// Platform Mappings
importRouter.get("/mappings/platforms", async (_req, res) => {
  try {
    const mappings = await storage.getPlatformMappings();
    res.json(mappings);
  } catch (error) {
    logger.error({ error }, "Error fetching platform mappings");
    res.status(500).json({ error: "Failed to fetch platform mappings" });
  }
});

importRouter.post(
  "/mappings/platforms",
  validate(insertPlatformMappingSchema),
  async (req, res) => {
    try {
      const mapping = insertPlatformMappingSchema.parse(req.body);
      const created = await storage.addPlatformMapping(mapping);
      return res.json(created);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: zodErrorMessage(error) });
      return res.status(500).json({ error: "Failed to create platform mapping" });
    }
  }
);

importRouter.patch(
  "/mappings/platforms/:id",
  validate(platformMappingPatchSchema),
  async (req, res) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const parsedUpdates = platformMappingPatchSchema.parse(req.body);
      const updates = Object.fromEntries(
        Object.entries(parsedUpdates).filter(([, value]) => value !== undefined)
      ) as Partial<InsertPlatformMapping>;
      const updated = await platformMappingService.updateMapping(id, updates);
      if (updated) {
        return res.json(updated);
      } else {
        return res.status(404).json({ error: "Mapping not found" });
      }
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: zodErrorMessage(error) });
      return res.status(500).json({ error: "Failed to update platform mapping" });
    }
  }
);

importRouter.delete("/mappings/platforms/:id", async (req, res) => {
  try {
    const success = await storage.removePlatformMapping(req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: "Mapping not found" });
  } catch (error) {
    logger.error({ error }, "Error deleting platform mapping");
    res.status(500).json({ error: "Failed to delete platform mapping" });
  }
});

importRouter.post("/mappings/platforms/init", async (_req, res) => {
  try {
    await platformMappingService.initializeDefaults();
    const mappings = await storage.getPlatformMappings();
    res.json({ success: true, count: mappings.length, mappings });
  } catch (error) {
    logger.error({ error }, "Error initializing platform mapping defaults");
    res.status(500).json({ error: "Failed to initialize defaults" });
  }
});

// Path Mappings
importRouter.get("/mappings/paths", async (_req, res) => {
  try {
    const mappings = await storage.getPathMappings();
    res.json(mappings);
  } catch (error) {
    logger.error({ error }, "Error fetching path mappings");
    res.status(500).json({ error: "Failed to fetch path mappings" });
  }
});

importRouter.post("/mappings/paths", validate(insertPathMappingSchema), async (req, res) => {
  try {
    const mapping = insertPathMappingSchema.parse(req.body);
    const created = await storage.addPathMapping(mapping);
    return res.json(created);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodErrorMessage(error) });
    return res.status(500).json({ error: "Failed to create path mapping" });
  }
});

importRouter.patch("/mappings/paths/:id", validate(updatePathMappingSchema), async (req, res) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const updates = updatePathMappingSchema.parse(req.body);
    const updated = await storage.updatePathMapping(id, updates);
    if (updated) {
      return res.json(updated);
    } else {
      return res.status(404).json({ error: "Mapping not found" });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodErrorMessage(error) });
    logger.error({ error }, "Error updating path mapping");
    return res.status(500).json({ error: "Failed to update path mapping" });
  }
});

importRouter.delete("/mappings/paths/:id", async (req, res) => {
  try {
    const success = await storage.removePathMapping(req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: "Mapping not found" });
  } catch (error) {
    logger.error({ error }, "Error deleting path mapping");
    res.status(500).json({ error: "Failed to delete path mapping" });
  }
});

// --- Configuration Management ---

importRouter.get("/config", async (_req, res) => {
  try {
    const userId = res.locals.userId as string;
    const config = await storage.getImportConfig(userId);
    res.json(config);
  } catch (error) {
    logger.error({ error }, "Error fetching import config");
    res.status(500).json({ error: "Failed to fetch import config" });
  }
});

importRouter.patch("/config", validate(importConfigPatchSchema), async (req, res) => {
  try {
    const userId = res.locals.userId as string;

    const updates = importConfigPatchSchema.parse(req.body);
    const current = await storage.getImportConfig(userId);
    const newConfig = { ...current, ...updates };

    const settingsPatch = {
      enablePostProcessing: newConfig.enablePostProcessing,
      autoUnpack: newConfig.autoUnpack,
      autoDeleteAfterImport: newConfig.autoDeleteAfterImport,
      renamePattern: newConfig.renamePattern,
      overwriteExisting: newConfig.overwriteExisting,
      transferMode: newConfig.transferMode,
      importPlatformIds: newConfig.importPlatformIds,
      ignoredExtensions: newConfig.ignoredExtensions,
      minFileSize: newConfig.minFileSize,
      libraryRoot: newConfig.libraryRoot,
      sortExtras: newConfig.sortExtras,
    };

    const existing = await storage.getUserSettings(userId);
    if (existing) {
      await storage.updateUserSettings(userId, settingsPatch);
    } else {
      await storage.createUserSettings({ userId, ...settingsPatch });
    }

    // Turning post-processing on is when people start relying on the library,
    // so pick up games already sitting in the root folders right away.
    // Fire-and-forget; progress is available via GET /api/library/scan/status.
    if (newConfig.enablePostProcessing && !current.enablePostProcessing) {
      rescanAllEnabledRootFolders(userId).catch((err) =>
        logger.error({ err }, "rescanAllEnabledRootFolders crashed")
      );
    }
    return res.json(newConfig);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodErrorMessage(error) });
    return res.status(500).json({ error: "Failed to update import config" });
  }
});

importRouter.get("/romm", async (_req, res) => {
  try {
    const userId = res.locals.userId as string;
    return res.json(await storage.getRomMConfig(userId));
  } catch (error) {
    logger.error({ error }, "Error fetching RomM config");
    return res.status(500).json({ error: "Failed to fetch RomM config" });
  }
});

importRouter.patch("/romm", validate(rommConfigPatchSchema), async (req, res) => {
  try {
    const userId = res.locals.userId as string;
    const patch = rommConfigPatchSchema.parse(req.body);
    const current = await storage.getRomMConfig(userId);
    const next = rommConfigSchema.parse({ ...current, ...patch });
    if (path.resolve(next.libraryRoot) === path.parse(path.resolve(next.libraryRoot)).root) {
      return res.status(400).json({ error: "RomM library root cannot be the filesystem root" });
    }
    return res.json(await storage.updateRomMConfig(userId, next));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodErrorMessage(error) });
    logger.error({ error }, "Error updating RomM config");
    return res.status(500).json({ error: "Failed to update RomM config" });
  }
});

importRouter.get("/hardlink/check", async (_req, res) => {
  try {
    const userId = res.locals.userId as string;

    const [config, downloaders, mappings] = await Promise.all([
      storage.getImportConfig(userId),
      storage.getEnabledDownloaders(),
      storage.getPathMappings(),
    ]);

    const translatedRoots = await Promise.all(
      downloaders.map((downloader) => {
        if (!downloader.downloadPath) return null;
        const remoteHost = parseHostFromUrl(downloader.url);
        return pathMappingService.translatePath(downloader.downloadPath, remoteHost, mappings);
      })
    );
    const sourceRoots = Array.from(
      new Set(
        translatedRoots
          .filter((value): value is string => !!value)
          .map((value) => path.resolve(value))
      )
    );

    if (sourceRoots.length === 0) {
      return res.json({
        generic: {
          targetRoot: config.libraryRoot,
          supportedForAll: null,
          checkedSources: [],
          reason: "No downloader download paths are configured.",
        },
      });
    }

    const genericChecks = await Promise.all(
      sourceRoots.map((sourcePath) => checkHardlinkPair(sourcePath, config.libraryRoot))
    );

    const summarize = (
      checks: Array<{
        sourcePath: string;
        targetPath: string;
        supported: boolean;
        sameDevice: boolean;
        reason?: string;
      }>
    ) => {
      const unsupported = checks.filter((check) => !check.supported);
      return {
        supportedForAll: unsupported.length === 0,
        checkedSources: checks,
        reason:
          unsupported.length === 0
            ? undefined
            : unsupported.map((check) => `${check.sourcePath}: ${check.reason}`).join("; "),
      };
    };

    return res.json({
      generic: {
        targetRoot: config.libraryRoot,
        ...summarize(genericChecks),
      },
    });
  } catch (error) {
    logger.error({ error }, "Error checking hardlink capability");
    return res.status(500).json({ error: "Failed to check hardlink capability" });
  }
});

// --- Operations ---
importRouter.get("/pending", async (_req, res) => {
  try {
    const userId = res.locals.userId as string;
    const [pathReviews, gameLinkReviews, quarantinedReviews] = await Promise.all([
      storage.getPendingImportReviews(userId),
      storage.getUnlinkedImportReviews(userId),
      storage.getQuarantinedDownloads(userId),
    ]);

    const pathResults = await Promise.all(
      pathReviews.map(async (d) => {
        const game = await storage.getGame(d.gameId);
        const passwordRequired = !!d.errorMessage?.startsWith(ARCHIVE_PASSWORD_REQUIRED_PREFIX);
        return {
          id: d.id,
          gameTitle: game?.title || d.downloadTitle,
          downloadTitle: d.downloadTitle,
          status: d.status,
          downloaderId: d.downloaderId,
          createdAt: d.addedAt,
          ...persistedServiceMessage(
            passwordRequired
              ? (d.errorMessage?.slice(ARCHIVE_PASSWORD_REQUIRED_PREFIX.length) ?? null)
              : d.errorMessage,
            d.errorMessageI18n
          ),
          passwordRequired,
        };
      })
    );

    const gameLinkResults = gameLinkReviews.map((d) => ({
      id: d.id,
      gameTitle: d.downloadTitle,
      downloadTitle: d.downloadTitle,
      status: d.status,
      downloaderId: d.downloaderId,
      createdAt: d.addedAt,
      ...persistedServiceMessage(d.errorMessage, d.errorMessageI18n),
    }));

    const quarantinedResults = await Promise.all(
      quarantinedReviews.map(async (d) => {
        const game = await storage.getGame(d.gameId);
        return {
          id: d.id,
          gameTitle: game?.title || d.downloadTitle,
          downloadTitle: d.downloadTitle,
          status: d.status,
          downloaderId: d.downloaderId,
          createdAt: d.addedAt,
          ...persistedServiceMessage(d.errorMessage, d.errorMessageI18n),
        };
      })
    );

    res.json([...gameLinkResults, ...quarantinedResults, ...pathResults]);
  } catch (error) {
    logger.error({ error }, "Error fetching pending imports");
    res.status(500).json({ error: "Internal server error" });
  }
});

importRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const userId = res.locals.userId as string;
    const download = await storage.getGameDownload(id, userId);
    if (!download) {
      return res.status(404).json({ error: "Download not found" });
    }

    if (download.status === GAME_LINK_REQUIRED_STATUS) {
      // Conditional on both owner and status so another user's recovery item
      // cannot be dismissed and a concurrent relink cannot be overwritten.
      const skipped = await storage.completeUnlinkedGameDownload(id, userId);
      if (!skipped) {
        return res
          .status(409)
          .json({ error: "Download was linked to a game before it could be skipped" });
      }
      return res.json({ success: true });
    }

    await storage.updateGameDownloadStatus(id, "completed");
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error skipping import");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Links a "game_link_required" download to the given game, then drops it back
// into the normal manual_review_required path-review flow (GET /:id/plan,
// POST /:id/confirm) so the rest of the import pipeline is reused unchanged.
importRouter.post("/:id/link", validate(linkGameDownloadBodySchema), async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  try {
    const userId = res.locals.userId as string;
    const { gameId } = linkGameDownloadBodySchema.parse(req.body);

    const download = await storage.getGameDownload(id, userId);
    if (!download) {
      return res.status(404).json({ error: "Download not found" });
    }
    if (download.status !== GAME_LINK_REQUIRED_STATUS) {
      return res.status(400).json({ error: "This download does not need to be linked to a game" });
    }

    const game = await storage.getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    if (game.userId !== userId) {
      return res.status(404).json({ error: "Game not found" });
    }

    const updated = await storage.relinkGameDownload(id, gameId, userId);
    if (!updated) {
      // Passed the game_link_required check above but the conditional update
      // still matched nothing — another request already relinked (or otherwise
      // moved on) this download between the check and the write.
      return res
        .status(409)
        .json({ error: "This download was already linked to a game by another request" });
    }
    return res.json({
      success: true,
      download: { id: updated.id, gameId: updated.gameId, status: updated.status },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: zodErrorMessage(error) });
    }
    logger.error({ error }, "Error linking download to game");
    return res.status(500).json({ error: "Internal server error" });
  }
});

importRouter.get("/:id/plan", async (req, res) => {
  const { id } = req.params;
  try {
    const userId = res.locals.userId as string;
    const overrideSource =
      typeof req.query.sourcePath === "string" ? req.query.sourcePath : undefined;
    const requestedStrategy = req.query.strategy === "romm" ? "romm" : "pc";
    const plan = await importManager.planConfirmImport(
      id,
      overrideSource,
      userId,
      requestedStrategy
    );
    return res.json(plan);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found"))
      return res.status(404).json({ error: error.message });
    logger.error({ error }, "Error planning import");
    return res.status(500).json({ error: "Internal server error" });
  }
});

importRouter.post("/:id/confirm", validate(confirmImportBodySchema), async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  try {
    const userId = res.locals.userId as string;

    const body = confirmImportBodySchema.parse(req.body);
    const config = await storage.getImportConfig(userId);
    const rommConfig = await storage.getRomMConfig(userId);
    if (body.strategy === "romm" && !rommConfig.enabled) {
      return res.status(400).json({ error: "RomM imports are disabled" });
    }
    const targetRoot = body.strategy === "romm" ? rommConfig.libraryRoot : config.libraryRoot;
    const safeProposedPath = resolveProposedPathWithinRoot(targetRoot, body.proposedPath);

    await importManager.confirmImport(
      id,
      {
        strategy: body.strategy,
        originalPath: body.originalPath ?? "",
        proposedPath: safeProposedPath,
        needsReview: false,
        reviewReason: "Manual Confirmation",
        transferMode:
          body.transferMode ?? (body.strategy === "romm" ? rommConfig.moveMode : undefined),
        unpack: body.unpack,
        password: body.password,
      },
      userId
    );

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof ArchivePasswordRequiredError) {
      return res.status(400).json({ error: error.message, passwordRequired: true });
    }
    if (error instanceof IncompleteScanError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof Error) {
      if (
        error.message === "Invalid proposed path" ||
        error.message === "Confirmation requires a plan" ||
        error.message.startsWith("Source path could not be resolved")
      ) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
    }
    logger.error({ error }, "Error confirming import");
    return res.status(500).json({ error: "Internal server error" });
  }
});
