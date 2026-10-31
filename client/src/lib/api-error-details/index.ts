import type { ApiErrorDetailSourceMessage } from "./source-messages";
import { getAdditionalApiErrorDetailLabel } from "./additional";
import { API_ERROR_DETAIL_LABELS as labels0 } from "./es";
import { API_ERROR_DETAIL_LABELS as labels1 } from "./zh-Hans";
import { API_ERROR_DETAIL_LABELS as labels2 } from "./hi";
import { API_ERROR_DETAIL_LABELS as labels3 } from "./de";
import { API_ERROR_DETAIL_LABELS as labels4 } from "./ja";
import { API_ERROR_DETAIL_LABELS as labels5 } from "./fr";
import { API_ERROR_DETAIL_LABELS as labels6 } from "./pt-BR";
import { API_ERROR_DETAIL_LABELS as labels7 } from "./ar";
import { API_ERROR_DETAIL_LABELS as labels8 } from "./ko";
import { API_ERROR_DETAIL_LABELS as labels9 } from "./zh-Hant";
import { API_ERROR_DETAIL_LABELS as labels10 } from "./vi";
import { API_ERROR_DETAIL_LABELS as labels11 } from "./id";

import type { InterfaceLanguage } from "@/lib/interface-locale";

const API_ERROR_DETAIL_LABELS: Record<
  Exclude<InterfaceLanguage, "en">,
  Record<ApiErrorDetailSourceMessage, string>
> = {
  es: labels0,
  "es-419": labels0,
  "zh-Hans": labels1,
  hi: labels2,
  de: labels3,
  ja: labels4,
  fr: labels5,
  "fr-CA": labels5,
  "pt-BR": labels6,
  ar: labels7,
  ko: labels8,
  "zh-Hant": labels9,
  vi: labels10,
  id: labels11,
};

export function getApiErrorDetailLabel(
  source: string,
  language: InterfaceLanguage
): string | undefined {
  if (language === "en" || !Object.hasOwn(API_ERROR_DETAIL_LABELS, language)) return undefined;
  const localeLabels = API_ERROR_DETAIL_LABELS[language];
  if (Object.hasOwn(localeLabels, source)) {
    return localeLabels[source as ApiErrorDetailSourceMessage];
  }
  return getAdditionalApiErrorDetailLabel(source, language);
}
