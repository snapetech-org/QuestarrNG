/**
 * Log submission utilities for the client's manual "Send Logs" flow (the
 * "Send Logs" button on the Logs page).
 *
 * PII scrubbing lives in `@shared/log-scrub` so it can also be used by the
 * server's automatic error-telemetry flow (see `server/error-telemetry.ts`)
 * without duplicating the regexes in two places.
 */

import { SUPPORT_WORKER_URL, GITHUB_ISSUES_URL } from "./support-config";
import { UI_LABELS } from "./ui-labels";

export { scrubPii, scrubLogLines } from "@shared/log-scrub";

// ── Worker communication ──────────────────────────────────────────────────────

export interface SendLogsPayload {
  logs: string;
  appVersion: string;
  platform: string;
  timestamp: string;
  /**
   * Distinguishes a manual user-initiated submission (omitted, the default)
   * from a telemetry report triggered by automatic error detection
   * (`server/error-telemetry.ts`). The worker doesn't act on this field yet —
   * it's forwarded so a future worker update can use it (e.g. for labeling).
   */
  reportType?: "telemetry-auto" | "telemetry-prompted";
}

export interface SendLogsSuccess {
  ok: true;
  code: string;
  issueNumber: number;
}

export interface SendLogsFailure {
  ok: false;
  status: number;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
}

export type SendLogsResult = SendLogsSuccess | SendLogsFailure;

export async function sendLogs(payload: SendLogsPayload): Promise<SendLogsResult> {
  if (SUPPORT_WORKER_URL.includes("REPLACE_ME")) {
    return {
      ok: false,
      status: 0,
      message: "Log upload is not configured for this build.",
      messageKey: "Log upload is not configured for this build.",
    };
  }

  try {
    const response = await fetch(SUPPORT_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as { code: string; issueNumber: number };
      return { ok: true, code: data.code, issueNumber: data.issueNumber };
    }

    const errorMessages: Record<number, string> = {
      413: "Log payload is too large (> 500 KB). Try clearing old logs first.",
      429: "Rate limit reached (5 submissions per hour). Try again later.",
      502: "Log server could not reach GitHub. Try again in a moment.",
    };

    let message = errorMessages[response.status] ?? `Unexpected error (HTTP ${response.status}).`;
    let messageKey: string | undefined =
      errorMessages[response.status] ?? "Unexpected error (HTTP {status}).";
    let messageValues = errorMessages[response.status] ? undefined : { status: response.status };
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
        messageKey = Object.hasOwn(UI_LABELS, body.error) ? body.error : undefined;
        messageValues = messageKey?.includes("{status}") ? { status: response.status } : undefined;
      }
    } catch {
      // ignore — use the default message
    }

    return {
      ok: false,
      status: response.status,
      message,
      ...(messageKey ? { messageKey } : {}),
      ...(messageValues && messageKey ? { messageValues } : {}),
    };
  } catch (err) {
    // Browser fetch failures are normally TypeErrors such as "Failed to fetch".
    // Keep those implementation-specific details out of the UI so the stable
    // network message can be localized, while preserving other unexpected
    // errors for diagnosis.
    const isNetworkError = err instanceof TypeError;
    const networkMessage = "Network error — check your connection.";
    return {
      ok: false,
      status: 0,
      message: isNetworkError || !(err instanceof Error) ? networkMessage : err.message,
      ...(isNetworkError || !(err instanceof Error) ? { messageKey: networkMessage } : {}),
    };
  }
}

// ── GitHub issue URL builder ──────────────────────────────────────────────────

/** Owner/repo of the private log repository, used to build a cross-repo issue reference. */
const LOG_REPO = "Doezer/Questarr-logs";

/**
 * Builds a URL to open a new issue in the public Questarr repo.
 * The body is pre-filled with the support log number and a direct cross-repo
 * reference to the corresponding issue in the private log repository, so the
 * maintainer (or an assistant with access to both repos) can jump straight
 * from the public issue to the matching log entry.
 */
export function buildGitHubIssueUrl(code: string, appVersion: string, issueNumber: number): string {
  const title = encodeURIComponent(`[Support] Issue with Questarr v${appVersion}`);
  const body = encodeURIComponent(
    `**Support log #:** \`${code}\` (${LOG_REPO}#${issueNumber})\n` +
      `**App version:** ${appVersion}\n\n` +
      `<!-- Describe what happened and the steps to reproduce it. -->\n`
  );
  return `${GITHUB_ISSUES_URL}?title=${title}&body=${body}`;
}

// ── Platform detection ────────────────────────────────────────────────────────

export function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X|macOS/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}
