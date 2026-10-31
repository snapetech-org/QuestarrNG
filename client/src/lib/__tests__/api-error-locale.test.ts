import { describe, expect, it } from "vitest";
import { getLocalizedApiErrorDetail, getLocalizedApiErrorMessage } from "@/lib/api-error-locale";
import {
  API_ERROR_DETAIL_LOCALE_ORDER,
  API_ERROR_DETAIL_TEMPLATES,
} from "@/lib/api-error-details/templates";

describe("getLocalizedApiErrorMessage", () => {
  it("uses an exact app-owned catalog entry for a fixed API error detail", () => {
    expect(
      getLocalizedApiErrorMessage("api.server_error", 500, "Failed to add notification", "es")
    ).toBe("No se pudo añadir la notificación");
  });

  it("describes a failed download claim as a failed game link", () => {
    const translations = {
      es: "No se pudo vincular la descarga a un juego",
      "zh-Hans": "无法将下载关联到游戏",
      hi: "डाउनलोड को गेम से लिंक नहीं किया जा सका",
      de: "Der Download konnte nicht mit einem Spiel verknüpft werden",
      ja: "ダウンロードをゲームに紐付けできませんでした",
      fr: "Impossible d’associer le téléchargement à un jeu",
      "pt-BR": "Não foi possível vincular o download a um jogo",
      ar: "تعذر ربط التنزيل بلعبة",
      ko: "다운로드를 게임에 연결하지 못했습니다",
      "zh-Hant": "無法將下載項目連結至遊戲",
      vi: "Không thể liên kết lượt tải xuống với trò chơi",
      id: "Gagal menghubungkan unduhan ke game",
    } as const;

    for (const [language, translation] of Object.entries(translations)) {
      expect(
        getLocalizedApiErrorMessage(
          "api.conflict",
          409,
          "Failed to claim download",
          language as InterfaceLanguage
        ),
        language
      ).toBe(translation);
    }
  });

  it("keeps unrecognized backend details intact after the localized category", () => {
    expect(
      getLocalizedApiErrorMessage("api.server_error", 500, "Transmission returned HTTP 503", "es")
    ).toBe("La solicitud falló. Inténtalo de nuevo: \u2068Transmission returned HTTP 503\u2069");
  });

  it("localizes app-owned error templates while preserving their dynamic values", () => {
    expect(
      getLocalizedApiErrorMessage("api.server_error", 500, "Failed to fetch popular games", "es")
    ).toBe("No se pudieron cargar los juegos populares");
    expect(
      getLocalizedApiErrorMessage(
        "api.server_error",
        500,
        "Failed to fetch games by genre",
        "zh-Hant"
      )
    ).toBe("無法依類型取得遊戲");
    expect(
      getLocalizedApiErrorMessage("api.bad_request", 400, "Invalid platform parameter", "ar")
    ).toBe("المعامل \u2068المنصة\u2069 غير صالح");
    expect(
      getLocalizedApiErrorMessage("api.server_error", 500, "Failed to fetch recent releases", "fr")
    ).toBe("Impossible de récupérer les sorties récentes");
    expect(
      getLocalizedApiErrorMessage(
        "api.server_error",
        500,
        "Failed to fetch upcoming releases",
        "ja"
      )
    ).toBe("今後のリリースを取得できませんでした");
    expect(
      getLocalizedApiErrorMessage(
        "api.bad_request",
        400,
        "Invalid SSL configuration: certificate/key mismatch",
        "ar"
      )
    ).toBe("إعدادات SSL غير صالحة: \u2068certificate/key mismatch\u2069");
    expect(
      getLocalizedApiErrorMessage(
        "api.bad_request",
        400,
        "Uploaded certificate/key are invalid: key is encrypted",
        "fr"
      )
    ).toBe("Le certificat ou la clé envoyé n’est pas valide : key is encrypted");
    expect(
      getLocalizedApiErrorMessage(
        "api.conflict",
        409,
        "You can have at most 3 API keys. Revoke one first.",
        "es"
      )
    ).toBe("Puedes tener como máximo 3 claves de API. Revoca una primero.");
    expect(
      getLocalizedApiErrorMessage(
        "api.rate_limited",
        429,
        "Too many IGDB requests are queued; try again shortly",
        "es"
      )
    ).toBe("Hay demasiadas solicitudes a IGDB en cola. Inténtalo de nuevo en breve.");
    expect(
      getLocalizedApiErrorMessage(
        "api.bad_request",
        400,
        "The provided domain is not in the allowed list: xrel-api.nfos.to, api.xrel.to",
        "ar"
      )
    ).toBe(
      "النطاق المُدخل غير موجود في قائمة النطاقات المسموح بها: \u2068xrel-api.nfos.to, api.xrel.to\u2069"
    );
  });

  it("only formats known app-owned templates and preserves arbitrary backend text", () => {
    expect(
      getLocalizedApiErrorMessage(
        "api.server_error",
        500,
        "Failed to fetch Transmission indexers",
        "es"
      )
    ).toBe(
      "La solicitud falló. Inténtalo de nuevo: \u2068Failed to fetch Transmission indexers\u2069"
    );
  });

  it("keeps every template placeholder intact in all twelve locale rows", () => {
    for (const [source, translations] of Object.entries(API_ERROR_DETAIL_TEMPLATES)) {
      const sourcePlaceholders = [...source.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
        .map((match) => match[1])
        .sort();

      expect(translations).toHaveLength(API_ERROR_DETAIL_LOCALE_ORDER.length);
      for (const [index, translation] of translations.entries()) {
        expect(translation.trim(), `${source} / ${API_ERROR_DETAIL_LOCALE_ORDER[index]}`).not.toBe(
          ""
        );
        expect(
          [...translation.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort(),
          `${source} / ${API_ERROR_DETAIL_LOCALE_ORDER[index]}`
        ).toEqual(sourcePlaceholders);
      }
    }
  });

  it("localizes known diagnostic details and preserves provider-supplied values", () => {
    expect(getLocalizedApiErrorDetail("No indexers configured", "es")).toBe(
      "No hay indexadores configurados"
    );
    expect(getLocalizedApiErrorDetail("Prowlarr feed returned HTTP 503.", "ar")).toBe(
      "أعاد موجز Prowlarr استجابة HTTP \u2068503\u2069."
    );
    expect(
      getLocalizedApiErrorDetail("Server responded with 503: upstream says queue unavailable", "es")
    ).toBe("El servidor respondió con 503: upstream says queue unavailable");
    expect(
      getLocalizedApiErrorDetail("Server responded with 503: upstream says queue unavailable", "ar")
    ).toBe("استجاب الخادم بالرمز \u2068503\u2069: \u2068upstream says queue unavailable\u2069");
    expect(
      getLocalizedApiErrorDetail(
        "Uploaded certificate/key are invalid: Certificate file missing",
        "es"
      )
    ).toBe("El certificado o la clave cargados no son válidos: Falta el archivo del certificado");
    expect(
      getLocalizedApiErrorMessage(
        "api.bad_request",
        400,
        "Invalid SSL configuration: Certificate file missing",
        "ar"
      )
    ).toBe("إعدادات SSL غير صالحة: \u2068ملف الشهادة غير موجود\u2069");
    expect(getLocalizedApiErrorDetail("Transmission returned HTTP 503", "es")).toBeUndefined();
  });
});
