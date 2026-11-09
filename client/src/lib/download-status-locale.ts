import type { DownloadStatusType } from "@shared/schema";

const DOWNLOAD_STATUS_SOURCES = {
  downloading: "Downloading",
  seeding: "Seeding",
  completed: "Completed",
  paused: "Paused",
  error: "Error",
  repairing: "Repairing...",
  unpacking: "Unpacking...",
  completed_pending_import: "downloads.status.pending_import",
  manual_review_required: "downloads.status.manual_review_required",
  imported: "Imported",
  failed: "Aborted",
  game_link_required: "downloads.status.game_link_required",
} satisfies Record<DownloadStatusType | "failed" | "game_link_required", string>;

/** App-owned states are localized; unknown provider state values remain raw. */
export function getDownloadStatusSource(status: string): string {
  return Object.hasOwn(DOWNLOAD_STATUS_SOURCES, status)
    ? DOWNLOAD_STATUS_SOURCES[status as keyof typeof DOWNLOAD_STATUS_SOURCES]
    : status;
}
