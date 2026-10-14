import { describe, expect, it } from "vitest";
import { isValidElement, type ReactNode } from "react";

import { API_ERROR_CODE_TO_CATALOG_KEY, getLocalizedApiErrorMessage } from "@/lib/api-error-locale";
import {
  getNotificationLabel,
  getNotificationTextDirection,
  getNotificationTitle,
  getNotificationTitleLanguage,
  formatNotificationAccessibleLabel,
  formatUnreadNotificationsLabel,
  NOTIFICATION_LOCALES,
} from "@/lib/notification-locale";
import { localizeNotificationMessage } from "@/lib/notification-messages";
import { UI_LABELS } from "@/lib/ui-labels";
import type { InterfaceLanguage } from "@/lib/interface-locale";

const labels = UI_LABELS as Record<string, Partial<Record<InterfaceLanguage, string>>>;

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g), (match) => match[1]!).sort();
}

function nodeText(value: ReactNode): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return nodeText(value.props.children);
  return "";
}

describe("UI catalog structure", () => {
  it("has a nonempty translation and matching placeholders for every locale cell", () => {
    const problems: string[] = [];

    for (const [source, translations] of Object.entries(labels)) {
      const expected = placeholders(source).join(",");
      for (const language of NOTIFICATION_LOCALES) {
        const translation = translations[language];
        if (!translation?.trim()) {
          problems.push(`${source} is missing ${language}`);
        } else if (placeholders(translation).join(",") !== expected) {
          problems.push(`${source} has mismatched placeholders in ${language}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("uses archive extraction terms and reviewed repair-status translations", () => {
    expect(labels.Unpacked?.es).toBe("Descomprimido");
    expect(labels.Unpacked?.fr).toBe("Décompressé");
    expect(labels.Unpacked?.["pt-BR"]).toBe("Descompactado");
    expect(labels["Unpacking..."]?.["zh-Hans"]).toBe("正在解压...");
    expect(labels["Unpacking..."]?.["zh-Hant"]).toBe("正在解壓...");
    expect(labels["Unpacking..."]?.vi).toBe("Đang giải nén...");
    expect(labels["Repair OK"]?.hi).toBe("सुधार सफल");
    expect(labels["Repair OK"]?.["zh-Hans"]).toBe("修复成功");
    expect(labels["Repair OK"]?.fr).toBe("Réparation réussie");
    expect(labels["Repair OK"]?.vi).toBe("Sửa chữa thành công");
    expect(labels["Mapping Deleted"]?.fr).toBe("Mappage supprimé");
    expect(labels["Mapping Deleted"]?.ko).toBe("매핑 삭제됨");
    expect(labels["Auto-Unpack Archives"]?.hi).toBe("संग्रह फ़ाइलें अपने-आप निकालें");
    expect(labels["Auto-Unpack Archives"]?.de).toBe("Archive automatisch entpacken");
    expect(labels["Unpack:"]?.ja).toBe("展開：");
    expect(labels["Auto-Sync Wishlist"]?.de).toBe("Wunschliste automatisch synchronisieren");
    expect(labels["Auto-Sync Wishlist"]?.es).toBe("Sincronizar automáticamente la lista de deseos");
    expect(labels["Auto-Sync Wishlist"]?.fr).toBe(
      "Synchroniser automatiquement la liste de souhaits"
    );
    expect(labels["Auto-Sync Wishlist"]?.id).toBe("Sinkronkan daftar keinginan secara otomatis");
  });
});

describe("notification locale helpers", () => {
  it.each(NOTIFICATION_LOCALES)("localizes notification labels and metadata for %s", (language) => {
    expect(getNotificationLabel("Game Released", language)).not.toBe("Game Released");
    expect(getNotificationTitleLanguage("Game Released", language)).toBe(language);

    const securityTitle = getNotificationTitle(
      "Security Alert: Download Flagged by ClamAV",
      language
    );
    expect(securityTitle).toContain("ClamAV");
    expect(securityTitle).not.toBe("Security Alert: Download Flagged by ClamAV");
    expect(
      getNotificationTitleLanguage("Security Alert: Download Flagged by ClamAV", language)
    ).toBe(language);

    const direction = language === "ar" ? "rtl" : "ltr";
    expect(getNotificationTextDirection(language)).toBe(direction);
    expect(formatNotificationAccessibleLabel(false, "Game Released", language)).toContain(
      "Game Released"
    );
    expect(formatUnreadNotificationsLabel(1200, language)).toContain(
      new Intl.NumberFormat(language).format(1200)
    );
  });

  it("keeps English and unknown event titles as English fallbacks", () => {
    expect(getNotificationLabel("Game Released", "en")).toBe("Game Released");
    expect(getNotificationLabel("Uncatalogued event", "es")).toBe("Uncatalogued event");
    expect(getNotificationTitle("Uncatalogued event", "es")).toBe("Uncatalogued event");
    expect(getNotificationTitleLanguage("Uncatalogued event", "es")).toBe("en");
    expect(getNotificationTitleLanguage("Game Released", "en")).toBe("en");
    expect(getNotificationTitle("Security Alert: Download Flagged by ClamAV", "en")).toBe(
      "Security Alert: Download Flagged by ClamAV"
    );
  });

  it("formats accessible labels for read and unread notifications", () => {
    expect(formatNotificationAccessibleLabel(true, "A game", "es")).toContain("A game");
    expect(formatNotificationAccessibleLabel(false, "A game", "es")).toContain("A game");
    expect(formatNotificationAccessibleLabel(false, "A game", "es")).not.toBe(
      formatNotificationAccessibleLabel(true, "A game", "es")
    );
  });
});

const notificationExamples: Array<[string, string, string[]]> = [
  ["Game Released", "Example game has been released!", ["Example game"]],
  ["Game Delayed", "Example game has been delayed to 2030-01-02", ["Example game", "2030-01-02"]],
  ["Download Completed", "Download finished for Example game", ["Example game"]],
  [
    "Import needs attention",
    '"Example game" finished downloading but the file path could not be resolved from the download client. Check Settings → Path Mappings or trigger the import manually.',
    ["Example game"],
  ],
  [
    "Import needs attention",
    '"Example game" finished downloading but its local path could not be accessed. Check Settings → Path Mappings or trigger the import manually.',
    ["Example game"],
  ],
  [
    "Download Aborted",
    'Download aborted for "Example game": User cancelled',
    ["Example game", "User cancelled"],
  ],
  [
    "Download Failed",
    'Download for "Example game" disappeared from the download client before completing and has been marked as failed. If it actually finished, you may need to import it manually.',
    ["Example game"],
  ],
  [
    "Release Flagged for Review",
    "Example game: Unverified release. Please review and choose.",
    ["Example game", "Unverified release"],
  ],
  [
    "Download Started",
    "Started downloading Example.Release via Usenet",
    ["Example.Release", "Usenet"],
  ],
  ["Game Available", "Example game is now available for download", ["Example game"]],
  [
    "Multiple Results Found",
    "3 result(s) found for Example game. Please review and choose.",
    ["Example game"],
  ],
  ["Game Updates Available", "4 update(s) found for Example game", ["Example game"]],
  ["Game Packs Available", "2 pack/add-on result(s) found for Example game", ["Example game"]],
  [
    "Available on xREL.to",
    "Example game is listed on xREL.to: Example.Release-GRP",
    ["Example game", "Example.Release-GRP"],
  ],
  ["Steam Wishlist Synced", "Successfully added 3 games from your Steam Wishlist.", []],
  [
    "Import extraction failed",
    '"Example game" was moved into your library, but extracting the archive failed: Invalid archive. The archive is left at /downloads/example.zip — extract or delete it manually to finish the import.',
    ["Example game", "Invalid archive", "/downloads/example.zip"],
  ],
  [
    "Auto-delete failed",
    '"Example game" was imported successfully, but removing it from the download client failed: Client unavailable. Please remove it manually.',
    ["Example game", "Client unavailable"],
  ],
  [
    "Automated error report sent",
    "Questarr detected an error and automatically sent a diagnostic report. Support code: QNG-123.",
    ["QNG-123"],
  ],
  [
    "Automated error report failed",
    "Questarr detected an error but could not send the automatic diagnostic report (Network error).",
    ["Network error"],
  ],
  [
    "An error occurred",
    "Questarr encountered an unexpected error. Click to review and optionally send a diagnostic report to help fix it.",
    [],
  ],
  [
    "Security Alert: Download Flagged by ClamAV",
    '"Example game" was flagged and quarantined. EICAR test signature',
    ["Example game", "EICAR test signature"],
  ],
];
const notificationCounts: Record<string, number> = {
  "Multiple Results Found": 3,
  "Game Updates Available": 4,
  "Game Packs Available": 2,
  "Steam Wishlist Synced": 3,
};

describe("notification message localization", () => {
  it.each(notificationExamples)(
    "localizes %s across all supported languages",
    (title, message, values) => {
      for (const language of NOTIFICATION_LOCALES) {
        const result = localizeNotificationMessage(title, message, language);
        const content = nodeText(result.content);

        expect(result.language).toBe(language);
        expect(result.direction).toBe(language === "ar" ? "rtl" : "ltr");
        for (const value of values) expect(content).toContain(value);
        const count = notificationCounts[title];
        if (count !== undefined) {
          expect(content).toContain(new Intl.NumberFormat(language).format(count));
        }
        if (title === "Game Available" && language === "ja") {
          expect(getNotificationLabel(title, language)).toBe("ダウンロード可能");
        }
        if (title === "An error occurred") expect(content).not.toBe(message);
      }
    }
  );

  it("uses the English message and automatic direction when localization cannot match", () => {
    const english = localizeNotificationMessage("Game Released", "A game was released!", "en");
    expect(english).toEqual({ content: "A game was released!", language: "en", direction: "auto" });

    const unknown = localizeNotificationMessage("Unknown event", "Unmatched details", "fr");
    expect(unknown).toEqual({ content: "Unmatched details", language: "en", direction: "auto" });
  });
});

const spanishApiErrors: Record<string, string> = {
  "api.bad_request": "No se pudo completar la solicitud.",
  "api.unauthorized": "Inicia sesión para continuar.",
  "api.forbidden": "No tienes permiso para realizar esa acción.",
  "api.not_found": "No se encontró el elemento solicitado.",
  "api.conflict": "Esta solicitud entra en conflicto con el estado actual.",
  "api.invalid_data": "Parte de la información enviada no es válida.",
  "api.rate_limited": "Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.",
  "api.upstream_unavailable": "Un servicio conectado no está disponible en este momento.",
  "api.service_unavailable": "El servicio no está disponible temporalmente.",
  "api.server_error": "La solicitud falló. Inténtalo de nuevo.",
  "api.request_failed": "La solicitud falló. Inténtalo de nuevo.",
};

describe("localized API errors", () => {
  it("provides Spanish text for every stable API error code", () => {
    expect(Object.keys(API_ERROR_CODE_TO_CATALOG_KEY).sort()).toEqual(
      Object.keys(spanishApiErrors).sort()
    );

    for (const [code, expected] of Object.entries(spanishApiErrors)) {
      expect(getLocalizedApiErrorMessage(code, 500, "", "es")).toBe(expected);
    }
  });

  it.each(NOTIFICATION_LOCALES)("has API error translations for %s", (language) => {
    expect(getLocalizedApiErrorMessage("api.bad_request", 400, "", language)).not.toBe("");
  });

  it("prefers a stable error code and falls back to the HTTP status for unknown codes", () => {
    expect(getLocalizedApiErrorMessage("api.forbidden", 404, "", "es")).toBe(
      spanishApiErrors["api.forbidden"]
    );
    expect(getLocalizedApiErrorMessage("custom.error", 401, "", "es")).toBe(
      spanishApiErrors["api.unauthorized"]
    );
    expect(getLocalizedApiErrorMessage(undefined, 503, "", "es")).toBe(
      spanishApiErrors["api.service_unavailable"]
    );
    expect(getLocalizedApiErrorMessage(undefined, 599, "", "es")).toBe(
      spanishApiErrors["api.server_error"]
    );
  });

  it("keeps English details and appends submitted details safely in Arabic", () => {
    expect(getLocalizedApiErrorMessage("api.not_found", 404, "Original server text", "en")).toBe(
      "Original server text"
    );
    expect(getLocalizedApiErrorMessage("api.not_found", 404, "", "es")).toBe(
      "No se encontró el elemento solicitado."
    );
    expect(
      getLocalizedApiErrorMessage(
        "api.bad_request",
        400,
        "Server detail",
        "unsupported" as InterfaceLanguage
      )
    ).toBe("Server detail");

    const arabic = getLocalizedApiErrorMessage("api.not_found", 404, "Example game", "ar");
    expect(arabic).toContain("Example game");
    expect(arabic).toContain("\u2068Example game\u2069");
  });
});
