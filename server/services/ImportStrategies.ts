import { Game, ImportConfig } from "../../shared/schema.js";
import { categorizeDownload, type DownloadCategory } from "../../shared/download-categorizer.js";
import fs from "fs-extra";
import path from "node:path";
import { opendir } from "node:fs/promises";
import { logger } from "../logger.js";
import { isSensitivePath, assertWithinRoots } from "../path-security.js";
import { EXTRACT_STAGING_PREFIX } from "./extract-staging.js";
export type TransferMode = "copy" | "move" | "hardlink" | "symlink";

export function sanitizeFsName(name: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (name ?? "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
}

export interface ImportResult {
  platformSlug?: string;
  platformDir?: string;
  destDir: string;
  filesPlaced: string[];
  modeUsed: TransferMode;
  conflictsResolved: string[];
}

export interface ImportReview {
  needsReview: boolean;
  reviewReason?: string | undefined;
  originalPath: string;
  proposedPath: string;
  /** Canonical containment boundary persisted with plans created by the server. */
  targetRoot?: string;
  strategy: "pc" | "romm";
  ignoredExtensions?: string[];
  fileCategories?: FileCategoryEntry[] | undefined;
  importResult?: ImportResult;
}

export interface FileCategoryEntry {
  name: string;
  category: DownloadCategory;
}

export interface PlanImportOptions {
  // Force the destination to be treated as a directory (no extension), used
  // when a single-file archive source will be unpacked before landing in
  // the library — the destination is a directory of extracted files, not a
  // file sharing the archive's own extension.
  treatAsDirectory?: boolean;
}

export interface ImportStrategy {
  planImport(
    sourcePath: string,
    game: Game,
    targetRoot: string,
    config: ImportConfig,
    platformDir?: string,
    options?: PlanImportOptions
  ): Promise<ImportReview>;
  executeImport(
    review: ImportReview,
    transferMode: TransferMode,
    excludePaths?: Set<string>
  ): Promise<ImportResult>;
}

// Walks from root down to filePath's parent one segment at a time, using lstat (which
// reports a symlink's own type rather than following it) rather than fs.ensureDir's
// plain mkdir -p semantics. An archive can extract a symlinked directory into a
// transfer's destination root before this runs; fs.ensureDir would silently follow
// that symlink for any later loose-file transfer sharing its name, writing outside
// root. Refusing to proceed through anything that isn't a genuine directory closes
// that path, whether the symlink is planted at root's immediate child or several
// segments down.
async function ensureParentDir(filePath: string, root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const parentDir = path.dirname(path.resolve(filePath));
  const relativeToRoot = path.relative(resolvedRoot, parentDir);
  const segments =
    relativeToRoot === "" || relativeToRoot === "." ? [] : relativeToRoot.split(path.sep);

  let current = resolvedRoot;
  await fs.ensureDir(current);
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await fs.lstat(current);
    } catch {
      await fs.mkdir(current);
      continue;
    }
    if (!stats.isDirectory()) {
      throw new Error(`Refusing to transfer through a non-directory or symlinked path: ${current}`);
    }
  }
}

interface WalkOptions {
  // Set only when walking a library folder: skips ArchiveService's .questarr-extract-*
  // staging and backup directories, which only ever sit directly under that folder. Never
  // set for a download's source tree, where a directory with that name is ordinary content
  // that must be transferred.
  skipExtractStaging?: boolean;
}

const MAX_IMPORT_WALK_ENTRIES = 100_000;
const MAX_IMPORT_WALK_DEPTH = 128;
const MAX_IMPORT_WALK_MS = 30_000;

async function walkRelative(rootPath: string, options: WalkOptions = {}): Promise<string[]> {
  const stats = await fs.stat(rootPath);
  if (!stats.isDirectory()) return [path.basename(rootPath)];

  const collected: string[] = [];
  const stack: Array<{ relativePath: string; depth: number }> = [{ relativePath: "", depth: 0 }];
  let visitedEntries = 0;
  const startedAt = Date.now();

  while (stack.length > 0) {
    if (Date.now() - startedAt > MAX_IMPORT_WALK_MS) {
      throw new Error(`Import directory walk exceeded ${MAX_IMPORT_WALK_MS} ms`);
    }
    const { relativePath: rel, depth } = stack.pop()!;
    const current = rel ? path.join(rootPath, rel) : rootPath;
    const directory = await opendir(current);
    for await (const entry of directory) {
      if (Date.now() - startedAt > MAX_IMPORT_WALK_MS) {
        throw new Error(`Import directory walk exceeded ${MAX_IMPORT_WALK_MS} ms`);
      }
      visitedEntries += 1;
      if (visitedEntries > MAX_IMPORT_WALK_ENTRIES) {
        throw new Error(`Import directory walk exceeded ${MAX_IMPORT_WALK_ENTRIES} entries`);
      }
      const entryRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing to import a symbolic link: ${path.join(current, entry.name)}`);
      }
      if (entry.isDirectory()) {
        if (options.skipExtractStaging && !rel && entry.name.startsWith(EXTRACT_STAGING_PREFIX)) {
          continue;
        }
        if (depth >= MAX_IMPORT_WALK_DEPTH) {
          throw new Error(`Import directory walk exceeded depth ${MAX_IMPORT_WALK_DEPTH}`);
        }
        stack.push({ relativePath: entryRel, depth: depth + 1 });
      } else if (entry.isFile()) {
        collected.push(entryRel);
      }
    }
  }

  return collected;
}

function isHardlinkFallbackErrno(code: string | undefined): boolean {
  return (
    code === "EXDEV" ||
    code === "EPERM" ||
    code === "EACCES" ||
    code === "ENOTSUP" ||
    code === "EOPNOTSUPP"
  );
}

// Shared by both hardlink paths below: try the hardlink, and on a fallback-eligible
// errno (EXDEV/EPERM/EACCES/ENOTSUP/EOPNOTSUPP), log once and copy instead. `cleanup`
// runs before the copy — needed for the whole-tree path, where a failure can leave a
// partial tree behind that would otherwise merge into the copy fallback's output.
async function withHardlinkFallback(
  source: string,
  destination: string,
  attemptHardlink: () => Promise<void>,
  cleanup?: () => Promise<void>
): Promise<"hardlink" | "copy"> {
  if (await fs.pathExists(destination)) {
    await fs.remove(destination);
  }
  try {
    await attemptHardlink();
    return "hardlink";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (cleanup) await cleanup();
    if (!isHardlinkFallbackErrno(code)) throw error;
    logger.warn(
      { source, destination, code },
      "[ImportStrategies] Hardlink failed, falling back to copy"
    );
    await fs.copy(source, destination, { overwrite: true });
    return "copy";
  }
}

async function linkOrCopyFallback(
  source: string,
  destination: string
): Promise<"hardlink" | "copy"> {
  return withHardlinkFallback(source, destination, () => fs.link(source, destination));
}

// Linux's link(2) always rejects a directory target with EPERM — hard links
// only ever point at a single inode (a file), never a directory tree. So a
// directory source has to be walked and linked file-by-file (mirroring what
// `cp -al` does on the CLI), rather than handed to fs.link() as one call,
// which would otherwise always fail for a multi-file torrent/release.
interface HardlinkWalkBudget {
  visitedEntries: number;
  startedAt: number;
}

const MAX_HARDLINK_WALK_ENTRIES = 100_000;
const MAX_HARDLINK_WALK_DEPTH = 128;
const MAX_HARDLINK_WALK_MS = 30_000;

async function hardlinkTree(
  source: string,
  destination: string,
  budget: HardlinkWalkBudget = { visitedEntries: 0, startedAt: Date.now() },
  depth = 0
): Promise<void> {
  if (Date.now() - budget.startedAt > MAX_HARDLINK_WALK_MS) {
    throw new Error(`Hardlink directory walk exceeded ${MAX_HARDLINK_WALK_MS} ms`);
  }
  if (depth > MAX_HARDLINK_WALK_DEPTH) {
    throw new Error(`Hardlink directory walk exceeded depth ${MAX_HARDLINK_WALK_DEPTH}`);
  }
  const stats = await fs.lstat(source);
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to hardlink a symbolic link: ${source}`);
  }
  if (!stats.isDirectory()) {
    if (!stats.isFile()) throw new Error(`Refusing to hardlink a non-file entry: ${source}`);
    await fs.link(source, destination);
    return;
  }

  await fs.ensureDir(destination);
  const directory = await opendir(source);
  for await (const entry of directory) {
    if (Date.now() - budget.startedAt > MAX_HARDLINK_WALK_MS) {
      throw new Error(`Hardlink directory walk exceeded ${MAX_HARDLINK_WALK_MS} ms`);
    }
    budget.visitedEntries += 1;
    if (budget.visitedEntries > MAX_HARDLINK_WALK_ENTRIES) {
      throw new Error(`Hardlink directory walk exceeded ${MAX_HARDLINK_WALK_ENTRIES} entries`);
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to hardlink a symbolic link: ${path.join(source, entry.name)}`);
    }
    await hardlinkTree(
      path.join(source, entry.name),
      path.join(destination, entry.name),
      budget,
      depth + 1
    );
  }
}

function isPathContainedIn(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))
  );
}

async function transferDirectoryHardlink(
  source: string,
  destination: string
): Promise<TransferMode> {
  // withHardlinkFallback removes destination before linking — if destination is an
  // ancestor of source, that removal deletes source (and anything else already under
  // destination) before the hardlink is even attempted. And if destination is nested
  // inside source, hardlinkTree's own ensureDir(destination) plus its walk of source
  // would recurse into the very directory it just created. Reject both directions
  // before going anywhere near the filesystem.
  const resolvedSource = path.resolve(source);
  const resolvedDestination = path.resolve(destination);
  if (
    isPathContainedIn(resolvedDestination, resolvedSource) ||
    isPathContainedIn(resolvedSource, resolvedDestination)
  ) {
    throw new Error(
      `Source and destination directories must not overlap for a hardlink transfer: ${source} -> ${destination}`
    );
  }

  return withHardlinkFallback(
    source,
    destination,
    () => hardlinkTree(source, destination),
    () => fs.remove(destination).catch(() => undefined)
  );
}

async function transferSingleFile(
  source: string,
  destination: string,
  mode: TransferMode,
  root: string
): Promise<TransferMode> {
  await ensureParentDir(destination, root);

  if (mode === "move") {
    await fs.move(source, destination, { overwrite: true });
    return "move";
  }

  if (mode === "copy") {
    await fs.copy(source, destination, { overwrite: true });
    return "copy";
  }

  if (mode === "symlink") {
    if (await fs.pathExists(destination)) await fs.remove(destination);
    await fs.symlink(source, destination);
    return "symlink";
  }

  return linkOrCopyFallback(source, destination);
}

// Hardlinks can't target a directory as one call, and excluding specific
// files (e.g. a raw archive whose contents were already extracted straight
// to the destination) requires acting per-file rather than on the
// directory as a whole.
async function transferDirectoryPerFile(
  source: string,
  destination: string,
  mode: TransferMode,
  excludePaths: Set<string>
): Promise<TransferMode> {
  const relFiles = await walkRelative(source);
  const plannedTransfers = relFiles
    .map((rel) => ({
      rel,
      srcFile: path.join(source, rel),
      destFile: path.join(destination, rel),
    }))
    .filter(({ srcFile }) => !excludePaths.has(path.resolve(srcFile)));

  // destination can already hold files by the time this runs — e.g. an archive's
  // volumes are excluded here because they were already extracted straight into
  // destination, and transferSingleFile's unconditional overwrite would otherwise
  // silently replace an extracted file with an unrelated loose one of the same name.
  for (const { destFile } of plannedTransfers) {
    if (await fs.pathExists(destFile)) {
      throw new Error(`Destination already exists, refusing to overwrite: ${destFile}`);
    }
  }

  let usedCopyFallback = false;
  let transferredAny = false;
  const attemptedMoves: Array<{ source: string; destination: string }> = [];

  for (const { srcFile, destFile } of plannedTransfers) {
    try {
      const entryMode = await transferSingleFile(srcFile, destFile, mode, destination);
      if (mode === "move") attemptedMoves.push({ source: srcFile, destination: destFile });
      if (mode === "hardlink" && entryMode === "copy") usedCopyFallback = true;
      transferredAny = true;
    } catch (error) {
      if (mode === "move") {
        const rollbackErrors = await rollbackMovedEntries([
          ...attemptedMoves,
          { source: srcFile, destination: destFile },
        ]);
        if (rollbackErrors.length > 0) {
          throw new Error(
            `Move import failed and ${rollbackErrors.length} source file(s) could not be restored`,
            { cause: error }
          );
        }
      }
      throw error;
    }
  }

  if (!transferredAny) {
    throw new Error("No files to transfer after applying exclusions");
  }

  if (mode === "move") {
    const resolvedSource = path.resolve(source);
    const resolvedDestination = path.resolve(destination);
    const destinationInsideSource = resolvedDestination.startsWith(resolvedSource + path.sep);
    // A destination nested inside its own source (e.g. hardlink/symlink extraction
    // landing inside the source directory) must not have that source removed out from
    // under it — the per-entry loop above already transferred everything worth keeping.
    if (resolvedSource !== resolvedDestination && !destinationInsideSource) {
      await fs.remove(source).catch(() => undefined);
    }
  }

  return mode === "hardlink" && usedCopyFallback ? "copy" : mode;
}

/** Restore files moved earlier in a multi-file import when a later transfer fails. */
async function rollbackMovedEntries(
  entries: Array<{ source: string; destination: string }>
): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const { source, destination } of [...entries].reverse()) {
    try {
      const [sourceExists, destinationExists] = await Promise.all([
        fs.pathExists(source),
        fs.pathExists(destination),
      ]);
      if (!destinationExists) continue;
      if (sourceExists) {
        // A failed cross-device move can leave a partial destination while the
        // complete source still exists. Preserve the source and remove the copy.
        await fs.remove(destination);
      } else {
        await fs.ensureDir(path.dirname(source));
        await fs.move(destination, source, { overwrite: false });
      }
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function transferFile(
  source: string,
  destination: string,
  mode: TransferMode,
  excludePaths?: Set<string>
): Promise<TransferMode> {
  if (path.resolve(source) === path.resolve(destination)) {
    return mode;
  }

  const stats = await fs.stat(source);
  const hasExcludes = !!excludePaths && excludePaths.size > 0;

  if (stats.isDirectory()) {
    if (hasExcludes) {
      return transferDirectoryPerFile(source, destination, mode, excludePaths);
    }
    if (mode === "hardlink") {
      return transferDirectoryHardlink(source, destination);
    }
    // fs-extra's recursive copy/move modes accept symbolic links inside the
    // source tree. Reject them and bound the preflight walk before any destination
    // changes, so a downloaded tree cannot plant an escaping link in the library.
    await walkRelative(source);
  }

  return transferSingleFile(source, destination, mode, path.dirname(destination));
}

export async function gatherFiles(rootPath: string, options: WalkOptions = {}): Promise<string[]> {
  if (isSensitivePath(rootPath)) {
    throw new Error("Refusing to process a sensitive system path");
  }

  const stats = await fs.stat(rootPath);
  if (!stats.isDirectory()) return [rootPath];

  const relFiles = await walkRelative(rootPath, options);
  return relFiles.map((rel) => path.join(rootPath, rel));
}

const CATEGORY_DIR_MAP: Record<DownloadCategory, string> = {
  main: "",
  dlc: "dlc",
  update: "update",
  extra: "extra",
  packs: "packs",
};

const SORT_EXTRAS_RESERVED_DIRS = new Set(["dlc", "update", "extra", "packs"]);
// Loose files a release folder commonly ships next to its single content directory.
// Their presence alone doesn't make that directory anything other than a wrapper.
const RELEASE_METADATA_FILE = /\.(nfo|sfv|md5|sha1|diz|txt|url|jpe?g|png)$/i;
// Edition words ("Foo.GOTY.Edition") trip the DLC patterns but name the whole game.
const EDITION_WORDS = /\b(goty|deluxe|complete|edition|repack)\b/gi;

/** Whether a release's only directory is a plain wrapper rather than an extra in itself. */
function isWrapperDirectory(name: string): boolean {
  if (SORT_EXTRAS_RESERVED_DIRS.has(name.toLowerCase())) return false;
  return categorizeDownload(name.replace(EDITION_WORDS, " ")).category === "main";
}

/**
 * An item's category from its name. An explicit type found once edition words are
 * set aside wins ("Game.GOTY.Edition.Update.v1.2" is an update); otherwise edition
 * words still count as the DLC signal they are ("Deluxe Content/").
 */
function categorizeItemName(name: string): DownloadCategory {
  const withoutEdition = categorizeDownload(name.replace(EDITION_WORDS, " ")).category;
  return withoutEdition === "main" ? categorizeDownload(name).category : withoutEdition;
}

/**
 * Assigns a Sort Extras category to every file of a release, given its paths
 * relative to the release root.
 *
 * Categories are decided per top-level item, from that item's own name, and every
 * file inside it inherits the result: matching the full relative path would let a
 * folder name ("Foo.GOTY.Edition/") or a game's internal layout ("Data/Patch/x.pak")
 * pull files out of the game and break it. A release wrapped in a single directory
 * (optionally next to .nfo/.sfv-style files) is descended into first, so the items
 * judged are the ones inside it rather than the wrapper itself, unless that
 * directory's own name marks it as an extra ("Update v1.2/", "Bonus Soundtrack/").
 */
export function categorizeRelativeFiles(relFiles: string[]): FileCategoryEntry[] {
  const split = relFiles.map((name) => ({ name, segments: name.split(path.sep) }));

  // Only the release's own outer wrapper is skipped: descending further would walk
  // into the game's internal layout ("Game/Data/Patch/") and judge its folders.
  const children = new Map<string, boolean>();
  for (const { segments } of split) {
    const child = segments[0];
    if (child === undefined) continue;
    children.set(child, (children.get(child) ?? false) || segments.length > 1);
  }
  const dirs = [...children].filter(([, isDir]) => isDir).map(([child]) => child);
  const files = [...children].filter(([, isDir]) => !isDir).map(([child]) => child);
  const wrapper = dirs.length === 1 ? dirs[0] : undefined;
  // A release wrapper holds the game itself, so it has files of its own. A sole
  // directory with only subdirectories ("Data/Patch/x.pak" at the game root) is
  // more likely the game's internal layout, which must not be judged item by item.
  const wrapperHasFiles = split.some(
    ({ segments }) => segments.length === 2 && segments[0] === wrapper
  );
  const depth =
    wrapper !== undefined &&
    wrapperHasFiles &&
    isWrapperDirectory(wrapper) &&
    files.every((file) => RELEASE_METADATA_FILE.test(file))
      ? 1
      : 0;

  const categoryByItem = new Map<string, DownloadCategory>();
  return split.map(({ name, segments }) => {
    // Metadata files sitting next to a wrapper belong to the release, not to an extra.
    if (segments.length <= depth) return { name, category: "main" };
    const item = segments[depth] ?? name;
    let category = categoryByItem.get(item);
    if (category === undefined) {
      // At the release root, an item already named after a category folder is left
      // where it is. Inside a wrapper ("Game/DLC/") it gets that folder's category,
      // so it is moved into the matching category folder like any other item.
      const reserved = item.toLowerCase();
      category = SORT_EXTRAS_RESERVED_DIRS.has(reserved)
        ? depth === 0
          ? "main"
          : (reserved as DownloadCategory)
        : categorizeItemName(item);
      categoryByItem.set(item, category);
    }
    return { name, category };
  });
}

async function categorizeSourceFiles(
  sourcePath: string,
  options: WalkOptions = {}
): Promise<FileCategoryEntry[]> {
  const files = await gatherFiles(sourcePath, options);
  return categorizeRelativeFiles(files.map((filePath) => path.relative(sourcePath, filePath)));
}

function resolveContainedPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Import path escapes review root: ${candidate}`);
  }
  return resolvedCandidate;
}

function destinationForFile(gameDir: string, entry: FileCategoryEntry): string {
  const firstSegment = entry.name.split(path.sep)[0]?.toLowerCase();
  if (["dlc", "update", "extra", "packs"].includes(firstSegment ?? "")) {
    return path.join(gameDir, entry.name);
  }

  const subdir = CATEGORY_DIR_MAP[entry.category];
  if (!subdir) return path.join(gameDir, entry.name);
  return path.join(gameDir, subdir, entry.name);
}

// An archive's final layout only exists once it's been extracted, so sortExtras
// categorization for an unpacked archive can't happen up front the way it does for a
// plain directory source (planImport/executeImport's fileCategories path, which reads
// the source before any transfer). Instead this runs as a cheap same-filesystem
// reorganization pass over the destination directory after extraction has already
// placed everything there.
export async function reorganizeBySortExtras(destDir: string): Promise<void> {
  const entries = await categorizeSourceFiles(destDir, { skipExtractStaging: true });
  const moves = entries.map((entry) => ({
    currentPath: path.resolve(path.join(destDir, entry.name)),
    desiredPath: path.resolve(destinationForFile(destDir, entry)),
  }));

  // Resolve every destination before moving anything: two entries landing on the same
  // categorized path (e.g. a root-level file and an identically-named one already
  // sitting in that category's subfolder) would otherwise have the second `fs.move`
  // silently overwrite the first with `overwrite: true`.
  const desiredPaths = new Set<string>();
  for (const { desiredPath } of moves) {
    if (desiredPaths.has(desiredPath)) {
      throw new Error(`Duplicate sortExtras destination: ${desiredPath}`);
    }
    desiredPaths.add(desiredPath);
  }

  for (const { currentPath, desiredPath } of moves) {
    if (currentPath === desiredPath) continue;
    await fs.ensureDir(path.dirname(desiredPath));
    await fs.move(currentPath, desiredPath, { overwrite: true });
  }
}

export class PCImportStrategy implements ImportStrategy {
  // Local filesystem roots a source path is allowed to live under, derived from
  // configured path mappings (see PathMappingService.getConfiguredRoots). Left empty
  // by default: with no mappings configured, translatePath() already passes remote
  // paths through unchanged and trusts the local filesystem wholesale, so there is no
  // meaningful root set to restrict against — the checks below are a no-op in that
  // case rather than fighting that existing trust model.
  constructor(private readonly sourceRoots: string[] = []) {}

  async planImport(
    sourcePath: string,
    game: Game,
    targetRoot: string,
    config: ImportConfig,
    platformDir?: string,
    options?: PlanImportOptions
  ): Promise<ImportReview> {
    if (isSensitivePath(sourcePath)) {
      throw new Error("Refusing to process a sensitive system path");
    }

    const safeSourcePath = await assertWithinRoots(
      sourcePath,
      this.sourceRoots,
      "Refusing to process a path outside the configured downloader roots"
    );

    const stats = await fs.stat(safeSourcePath);
    const cleanTitle = sanitizeFsName(game.title);
    const ext =
      options?.treatAsDirectory || stats.isDirectory() ? "" : path.extname(safeSourcePath);
    const destination = path.join(targetRoot, platformDir ?? "PC", cleanTitle + ext);

    // sanitizeFsName strips filesystem-illegal characters but not ".." segments, so a
    // game title alone doesn't guarantee destination stays under targetRoot. Verify
    // containment the same way resolveContainedPath does below, rather than trusting
    // the title never contains a traversal sequence.
    const relativeToRoot = path.relative(targetRoot, destination);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      throw new Error("Computed destination escapes the configured library root");
    }
    const safeDestination = await assertWithinRoots(
      destination,
      [targetRoot],
      "Computed destination escapes the configured library root"
    );

    const fileCategories =
      stats.isDirectory() && config.sortExtras
        ? await categorizeSourceFiles(safeSourcePath)
        : undefined;

    const destinationExists = await fs.pathExists(safeDestination);
    const needsReview = destinationExists && !config.overwriteExisting;

    return {
      needsReview,
      reviewReason: needsReview ? "Destination already exists" : undefined,
      originalPath: safeSourcePath,
      proposedPath: safeDestination,
      targetRoot,
      strategy: "pc",
      fileCategories,
    };
  }

  async executeImport(
    review: ImportReview,
    transferMode: TransferMode,
    excludePaths?: Set<string>
  ): Promise<ImportResult> {
    // Checked once here rather than in transferFile/gatherFiles individually: the
    // categorized branch below calls transferSingleFile directly (bypassing
    // transferFile's own checks), so a single guard at this shared entry point is what
    // actually covers every branch, including that one.
    if (isSensitivePath(review.originalPath) || isSensitivePath(review.proposedPath)) {
      throw new Error("Refusing to process a sensitive system path");
    }

    // Same containment check as planImport, applied here too since executeImport is a
    // second, independent entry point: a confirmImport call can supply review.originalPath
    // directly, without ever going through planImport first.
    review.originalPath = await assertWithinRoots(
      review.originalPath,
      this.sourceRoots,
      "Refusing to process a path outside the configured downloader roots"
    );
    if (!review.targetRoot) {
      throw new Error("Target root is required for import validation");
    }
    review.proposedPath = await assertWithinRoots(
      review.proposedPath,
      [review.targetRoot],
      "Proposed destination escapes the configured library root"
    );

    if (review.fileCategories && review.fileCategories.length > 0) {
      const filesPlaced: string[] = [];
      const conflictsResolved: string[] = [];
      // Keep modeUsed as the originally-requested batch mode: a per-file fallback
      // (e.g. hardlink -> copy for one file among many) is recorded per-entry in
      // conflictsResolved instead, so it isn't lost by being overwritten here.
      const modeUsed: TransferMode = transferMode;

      const plannedTransfers = review.fileCategories
        .map((entry) => ({
          entry,
          sourceFile: resolveContainedPath(
            review.originalPath,
            path.join(review.originalPath, entry.name)
          ),
          destinationFile: resolveContainedPath(
            review.proposedPath,
            destinationForFile(review.proposedPath, entry)
          ),
        }))
        // Excluded entries (e.g. a raw archive already extracted straight to the
        // destination) stay untransferred — same as the plain-directory path below.
        .filter(({ sourceFile }) => !excludePaths?.has(path.resolve(sourceFile)));

      // If exclusions consumed the entire plan (isAlreadyExtracted's match doesn't
      // guarantee any file survives outside the excluded volume set), fail loudly the
      // same way transferDirectoryPerFile does — silently "succeeding" with an empty
      // filesPlaced would still finalize the import and, in move mode, remove
      // originalPath below despite having transferred nothing.
      if (plannedTransfers.length === 0) {
        throw new Error("No files to transfer after applying exclusions");
      }

      const destinations = new Set<string>();
      for (const { destinationFile } of plannedTransfers) {
        const resolvedDestination = path.resolve(destinationFile);
        if (destinations.has(resolvedDestination)) {
          throw new Error(`Duplicate import destination: ${resolvedDestination}`);
        }
        destinations.add(resolvedDestination);
      }

      // The check above only catches planned destinations colliding with each other.
      // For this transfer mode (unpackViaLinkedExtraction), destination can already
      // hold files an archive extracted straight into it before this runs, and
      // transferSingleFile's unconditional overwrite would otherwise silently replace
      // an extracted file with an unrelated loose one of the same name — the same
      // failure mode transferDirectoryPerFile guards against above.
      for (const { destinationFile } of plannedTransfers) {
        if (await fs.pathExists(destinationFile)) {
          throw new Error(`Destination already exists, refusing to overwrite: ${destinationFile}`);
        }
      }

      const attemptedMoves: Array<{ source: string; destination: string }> = [];
      for (const { entry, sourceFile, destinationFile } of plannedTransfers) {
        try {
          const entryMode = await transferSingleFile(
            sourceFile,
            destinationFile,
            transferMode,
            review.proposedPath
          );
          if (transferMode === "move") {
            attemptedMoves.push({ source: sourceFile, destination: destinationFile });
          }
          filesPlaced.push(destinationFile);
          if (entryMode !== transferMode) {
            conflictsResolved.push(`${entry.name} (mode fallback: ${entryMode})`);
          }
        } catch (error) {
          if (transferMode === "move") {
            const rollbackErrors = await rollbackMovedEntries([
              ...attemptedMoves,
              { source: sourceFile, destination: destinationFile },
            ]);
            if (rollbackErrors.length > 0) {
              throw new Error(
                `Move import failed and ${rollbackErrors.length} source file(s) could not be restored`,
                { cause: error }
              );
            }
          }
          throw error;
        }
      }

      const resolvedSource = path.resolve(review.originalPath);
      const resolvedDestination = path.resolve(review.proposedPath);
      const destinationInsideSource = resolvedDestination.startsWith(resolvedSource + path.sep);
      if (
        transferMode === "move" &&
        resolvedSource !== resolvedDestination &&
        !destinationInsideSource
      ) {
        await fs.remove(review.originalPath);
      }

      return {
        destDir: review.proposedPath,
        filesPlaced,
        modeUsed,
        conflictsResolved,
      };
    }

    await fs.ensureDir(path.dirname(review.proposedPath));
    const modeUsed = await transferFile(
      review.originalPath,
      review.proposedPath,
      transferMode,
      excludePaths
    );
    const filesPlaced = await gatherFiles(review.proposedPath, { skipExtractStaging: true });
    return {
      destDir: review.proposedPath,
      filesPlaced,
      modeUsed,
      conflictsResolved: [],
    };
  }
}
