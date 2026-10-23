/**
 * Budgets for the recursive Scan Disk walk (`GET /api/games/:gameId/files`).
 *
 * A very large library tree can exhaust filesystem I/O and memory if walked
 * without limits, so the traversal skips over-depth subtrees, stops when its
 * file, response-size, or time budget is exhausted, and reports truncation
 * whenever a limit excludes part of the tree (see issue #944).
 */

/** Maximum number of files a single scan will return before truncating. */
export let SCAN_MAX_FILES = 5000;

/** Maximum encoded JSON response size for one scan, including file records. */
export let SCAN_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Maximum nested directory depth below a game's library folder. */
export let SCAN_MAX_DEPTH = 128;

/** Wall-clock budget (in ms) for a single scan traversal. */
export let SCAN_TIME_BUDGET_MS = 5000;

/**
 * Override the budgets. Intended for tests that need to trip the caps
 * without creating thousands of files or waiting for real timers.
 */
export function setScanBudgets(overrides: {
  maxFiles?: number;
  maxResponseBytes?: number;
  maxDepth?: number;
  timeBudgetMs?: number;
}): void {
  if (overrides.maxFiles !== undefined) SCAN_MAX_FILES = overrides.maxFiles;
  if (overrides.maxResponseBytes !== undefined)
    SCAN_MAX_RESPONSE_BYTES = overrides.maxResponseBytes;
  if (overrides.maxDepth !== undefined) SCAN_MAX_DEPTH = overrides.maxDepth;
  if (overrides.timeBudgetMs !== undefined) SCAN_TIME_BUDGET_MS = overrides.timeBudgetMs;
}

/** Restore the production budgets (call from test teardown). */
export function resetScanBudgets(): void {
  SCAN_MAX_FILES = 5000;
  SCAN_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
  SCAN_MAX_DEPTH = 128;
  SCAN_TIME_BUDGET_MS = 5000;
}
