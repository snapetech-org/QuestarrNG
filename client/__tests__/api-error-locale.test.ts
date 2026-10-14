import { describe, expect, it } from "vitest";

import { getLocalizedApiErrorMessage } from "@/lib/api-error-locale";
import type { InterfaceLanguage } from "@/lib/interface-locale";

const badRequestByLanguage = [
  ["es", "No se pudo completar la solicitud."],
  ["zh-Hans", "无法完成该请求。"],
  ["hi", "अनुरोध पूरा नहीं किया जा सका।"],
  ["de", "Die Anfrage konnte nicht abgeschlossen werden."],
  ["ja", "リクエストを完了できませんでした。"],
  ["fr", "La requête n’a pas pu aboutir."],
  ["pt-BR", "Não foi possível concluir a solicitação."],
  ["ar", "تعذر إكمال الطلب."],
  ["ko", "요청을 완료할 수 없습니다."],
  ["zh-Hant", "無法完成此要求。"],
  ["vi", "Không thể hoàn tất yêu cầu."],
  ["id", "Permintaan tidak dapat diselesaikan."],
] as const;

describe("localized API error catalog", () => {
  it.each(badRequestByLanguage)("selects the correct message for %s", (language, expected) => {
    expect(getLocalizedApiErrorMessage("api.bad_request", 400, "invalid input", language)).toBe(
      `${expected}: \u2068invalid input\u2069`
    );
  });

  it("returns server detail when a locale has no catalog entry", () => {
    expect(
      getLocalizedApiErrorMessage(
        "api.bad_request",
        400,
        "server detail",
        "unsupported" as InterfaceLanguage
      )
    ).toBe("server detail");
  });
});
