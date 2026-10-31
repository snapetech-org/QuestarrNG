import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalizedApiErrorMessage } from "@/lib/api-error-locale";
import type { InterfaceLanguage } from "@/lib/interface-locale";
import {
  API_ERROR_DETAIL_BASE_SOURCE_MESSAGES,
  API_ERROR_DETAIL_SOURCE_MESSAGES,
} from "@/lib/api-error-details/source-messages";
import { ADDITIONAL_API_ERROR_DETAIL_SOURCE_MESSAGES } from "@/lib/api-error-details/additional-source-messages";
import { getApiErrorDetailLabel } from "@/lib/api-error-details";
import { hasInterfaceMessage } from "@/lib/interface-locale";
import { API_ERROR_DETAIL_LABELS as spanish } from "@/lib/api-error-details/es";
import { API_ERROR_DETAIL_LABELS as simplifiedChinese } from "@/lib/api-error-details/zh-Hans";
import { API_ERROR_DETAIL_LABELS as hindi } from "@/lib/api-error-details/hi";
import { API_ERROR_DETAIL_LABELS as german } from "@/lib/api-error-details/de";
import { API_ERROR_DETAIL_LABELS as japanese } from "@/lib/api-error-details/ja";
import { API_ERROR_DETAIL_LABELS as french } from "@/lib/api-error-details/fr";
import { API_ERROR_DETAIL_LABELS as arabic } from "@/lib/api-error-details/ar";
import { API_ERROR_DETAIL_LABELS as indonesian } from "@/lib/api-error-details/id";
import { API_ERROR_DETAIL_LABELS as korean } from "@/lib/api-error-details/ko";
import { API_ERROR_DETAIL_LABELS as brazilianPortuguese } from "@/lib/api-error-details/pt-BR";
import { API_ERROR_DETAIL_LABELS as traditionalChinese } from "@/lib/api-error-details/zh-Hant";
import { API_ERROR_DETAIL_LABELS as vietnamese } from "@/lib/api-error-details/vi";

const API_ERROR_SOURCE_FILES = [
  "server/routes.ts",
  "server/routes/import.ts",
  "server/routes/system.ts",
  "server/game-journal-routes.ts",
  "server/steam-routes.ts",
  "server/routes/api-keys.ts",
  "server/routes/integration.ts",
  "server/routes/import-tasks.ts",
  "server/pcgamingwiki-router.ts",
  "server/auth.ts",
  "server/oidc-auth.ts",
  "server/hltb.ts",
  "server/security.ts",
  "server/middleware.ts",
  "server/igdb.ts",
  "server/apprise.ts",
  "server/prowlarr.ts",
  "server/search.ts",
  "server/ssl.ts",
  "server/root-folders.ts",
  "server/library-scanner.ts",
  "server/services/ImportManager.ts",
  "server/services/ArchiveService.ts",
  "server/security-scan.ts",
  "server/cron.ts",
] as const;

const ADDITIONAL_API_ERROR_SOURCE_FILES = [
  "server/routes.ts",
  "server/routes/integration.ts",
  "server/middleware.ts",
  "server/routes/import.ts",
  "server/oidc-auth.ts",
  "server/hltb.ts",
  "server/igdb.ts",
  "server/apprise.ts",
  "server/prowlarr.ts",
  "server/search.ts",
  "server/ssl.ts",
  "server/root-folders.ts",
  "server/library-scanner.ts",
  "server/services/ImportManager.ts",
  "server/services/ArchiveService.ts",
  "server/security-scan.ts",
  "server/cron.ts",
] as const;

const ALL_TARGET_LOCALE_CATALOGS = {
  es: spanish,
  "zh-Hans": simplifiedChinese,
  hi: hindi,
  de: german,
  ja: japanese,
  fr: french,
  "pt-BR": brazilianPortuguese,
  ar: arabic,
  ko: korean,
  "zh-Hant": traditionalChinese,
  vi: vietnamese,
  id: indonesian,
} as const;

const NON_UI_FIXED_ERROR_LITERALS = new Set([
  "failure", // Apprise protocol status value, not an error message for the UI.
  "Invalid certificate path", // getCertInfo only logs/omits these diagnostic results.
  "Certificate file not found",
]);

function getPlaceholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

function getTags(message: string): string[] {
  return [...message.matchAll(/<\/?([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/g)]
    .map((match) => match[1].toLowerCase())
    .sort();
}

describe("API error detail source catalog", () => {
  it("covers every fixed browser-facing API error literal exactly once", () => {
    const source = API_ERROR_SOURCE_FILES.map((file) =>
      readFileSync(resolve(process.cwd(), file), "utf8")
    ).join("\n");
    const fixedErrors = new Set<string>();
    const errorLiteral = /\berror\s*:\s*(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;

    for (const match of source.matchAll(errorLiteral)) {
      const message = match[2].replace(/\\([\\"'])/g, "$1");
      if (!message.includes("${") && !NON_UI_FIXED_ERROR_LITERALS.has(message)) {
        fixedErrors.add(message);
      }
    }

    const listedKeys = new Set<string>(API_ERROR_DETAIL_SOURCE_MESSAGES);
    const missing = [...fixedErrors].filter(
      (message) => !hasInterfaceMessage(message) && !listedKeys.has(message)
    );
    const stale = API_ERROR_DETAIL_SOURCE_MESSAGES.filter((message) => !source.includes(message));

    expect(fixedErrors.size).toBeGreaterThanOrEqual(278);
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
    expect(API_ERROR_DETAIL_BASE_SOURCE_MESSAGES).toHaveLength(252);
    expect(API_ERROR_DETAIL_SOURCE_MESSAGES).toHaveLength(
      API_ERROR_DETAIL_BASE_SOURCE_MESSAGES.length +
        ADDITIONAL_API_ERROR_DETAIL_SOURCE_MESSAGES.length
    );
    expect(new Set(API_ERROR_DETAIL_SOURCE_MESSAGES).size).toBe(
      API_ERROR_DETAIL_SOURCE_MESSAGES.length
    );
    expect(listedKeys.size).toBe(API_ERROR_DETAIL_SOURCE_MESSAGES.length);
  });

  it("binds each added fixed detail to its server source", () => {
    const source = ADDITIONAL_API_ERROR_SOURCE_FILES.map((file) =>
      readFileSync(resolve(process.cwd(), file), "utf8")
    ).join("\n");
    for (const message of ADDITIONAL_API_ERROR_DETAIL_SOURCE_MESSAGES) {
      expect(source, message).toContain(message);
    }
  });

  it("keeps dynamic source templates represented with ICU placeholders", () => {
    const source = API_ERROR_SOURCE_FILES.map((file) =>
      readFileSync(resolve(process.cwd(), file), "utf8")
    ).join("\n");
    const expected = [
      "Failed to fetch ${errorLabel}",
      "Invalid ${paramName} parameter",
      "Failed to fetch games by ${errorLabel}",
      "Invalid SSL configuration: ${error}",
      "Uploaded certificate/key are invalid: ${error}",
      "You can have at most ${MAX_KEYS_PER_USER} API keys. Revoke one first.",
      "Twitch returned an unexpected error (status " + "$" + "{tokenResponse.status}).",
      "IGDB rejected the request (status " + "$" + "{igdbResponse.status}).",
      "IGDB API error: " + "$" + "{response.status}",
      "Server responded with " + "$" + "{res.status}: " + "$" + "{text}",
      "Prowlarr management API returned HTTP " + "$" + "{status}.",
      "Prowlarr indexer inventory returned HTTP " + "$" + "{status}.",
      "Prowlarr management API failed after HTTP " + "$" + "{status}.",
      "Prowlarr feed returned HTTP " + "$" + "{responseStatus}.",
      "Download " + "$" + "{downloadId} not found",
      "Game not found for download " + "$" + "{downloadId}",
      "Source path not found: " + "$" + "{safeOriginalPath}",
      "RomM destination already exists: " + "$" + "{destination}",
      "Could not find a free RomM destination for " + "$" + "{destination}",
      "Archive contains too many entries (limit: " + "$" + "{ARCHIVE_MAX_ENTRIES}).",
      "Archive expands beyond the configured size limit (" +
        "$" +
        "{ARCHIVE_MAX_EXPANDED_BYTES} bytes).",
      "VirusTotal detected " +
        "$" +
        "{verdict.positives} engine(s) flagging this file (threshold: " +
        "$" +
        "{vtSettings.threshold})",
      "ClamAV detected " + "$" + "{verdict.signature} in " + "$" + "{path.basename(file)}",
      "The provided domain is not in the allowed list: " +
        "$" +
        '{ALLOWED_XREL_DOMAINS.join(", ")}',
    ];

    for (const template of expected) expect(source).toContain(template);
    expect(expected).toHaveLength(24);
    expect(source.match(/Invalid SSL configuration: \$\{error\}/g)).toHaveLength(2);
  });

  it("has complete nonblank translations for all twelve target locales", () => {
    const baseSourceKeys = [...API_ERROR_DETAIL_BASE_SOURCE_MESSAGES].sort();

    expect(Object.keys(ALL_TARGET_LOCALE_CATALOGS)).toHaveLength(12);
    for (const [locale, catalog] of Object.entries(ALL_TARGET_LOCALE_CATALOGS)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(baseSourceKeys);
      for (const source of API_ERROR_DETAIL_SOURCE_MESSAGES) {
        const translation = getApiErrorDetailLabel(source, locale as InterfaceLanguage);
        expect(translation, locale + ": " + source).toBeDefined();
        if (!translation) continue;
        expect(translation.trim(), locale + ": " + source).not.toBe("");
        expect(translation, locale + ": " + source).not.toBe(source);
        expect(getPlaceholders(translation), `${locale}: ${source}`).toEqual(
          getPlaceholders(source)
        );
        expect(getTags(translation), `${locale}: ${source}`).toEqual(getTags(source));
        expect(
          getLocalizedApiErrorMessage("api.server_error", 500, source, locale as InterfaceLanguage),
          `${locale}: ${source}`
        ).toBe(translation);
      }
    }
  });
});
