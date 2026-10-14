import type { InterfaceLanguage } from "@/lib/interface-locale";
import { apiErrorCodeForStatus, type ApiErrorCode } from "@shared/api-error-codes";

type ApiErrorCatalogKey =
  | "requestFailed"
  | "badRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "invalidData"
  | "rateLimited"
  | "upstreamUnavailable"
  | "serviceUnavailable";

export const API_ERROR_CODE_TO_CATALOG_KEY: Record<ApiErrorCode, ApiErrorCatalogKey> = {
  "api.bad_request": "badRequest",
  "api.unauthorized": "unauthorized",
  "api.forbidden": "forbidden",
  "api.not_found": "notFound",
  "api.conflict": "conflict",
  "api.invalid_data": "invalidData",
  "api.rate_limited": "rateLimited",
  "api.upstream_unavailable": "upstreamUnavailable",
  "api.service_unavailable": "serviceUnavailable",
  "api.server_error": "requestFailed",
  "api.request_failed": "requestFailed",
};

const API_ERROR_MESSAGES: Record<ApiErrorCatalogKey, readonly string[]> = {
  requestFailed: [
    "La solicitud falló. Inténtalo de nuevo.",
    "请求失败，请重试。",
    "अनुरोध विफल हुआ। कृपया फिर से कोशिश करें।",
    "Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.",
    "リクエストに失敗しました。もう一度お試しください。",
    "La requête a échoué. Veuillez réessayer.",
    "A solicitação falhou. Tente novamente.",
    "تعذر إكمال الطلب. يُرجى المحاولة مرة أخرى.",
    "요청에 실패했습니다. 다시 시도하세요.",
    "要求失敗，請再試一次。",
    "Yêu cầu không thành công. Hãy thử lại.",
    "Permintaan gagal. Silakan coba lagi.",
  ],
  badRequest: [
    "No se pudo completar la solicitud.",
    "无法完成该请求。",
    "अनुरोध पूरा नहीं किया जा सका।",
    "Die Anfrage konnte nicht abgeschlossen werden.",
    "リクエストを完了できませんでした。",
    "La requête n’a pas pu aboutir.",
    "Não foi possível concluir a solicitação.",
    "تعذر إكمال الطلب.",
    "요청을 완료할 수 없습니다.",
    "無法完成此要求。",
    "Không thể hoàn tất yêu cầu.",
    "Permintaan tidak dapat diselesaikan.",
  ],
  unauthorized: [
    "Inicia sesión para continuar.",
    "请登录后继续。",
    "जारी रखने के लिए साइन इन करें।",
    "Zum Fortfahren musst du dich anmelden.",
    "続行するにはログインしてください。",
    "Connectez-vous pour continuer.",
    "Entre para continuar.",
    "يجب تسجيل الدخول للمتابعة.",
    "계속하려면 로그인하세요.",
    "請先登入以繼續。",
    "Hãy đăng nhập để tiếp tục.",
    "Silakan masuk untuk melanjutkan.",
  ],
  forbidden: [
    "No tienes permiso para realizar esa acción.",
    "你没有权限执行此操作。",
    "आपको यह करने की अनुमति नहीं है।",
    "Du hast keine Berechtigung für diese Aktion.",
    "この操作を行う権限がありません。",
    "Vous n’avez pas l’autorisation d’effectuer cette action.",
    "Você não tem permissão para fazer isso.",
    "ليست لديك صلاحية لتنفيذ ذلك.",
    "이 작업을 수행할 권한이 없습니다.",
    "您沒有權限執行此操作。",
    "Bạn không có quyền thực hiện thao tác này.",
    "Anda tidak memiliki izin untuk melakukan tindakan ini.",
  ],
  notFound: [
    "No se encontró el elemento solicitado.",
    "找不到请求的项目。",
    "अनुरोधित आइटम नहीं मिला।",
    "Das angeforderte Element wurde nicht gefunden.",
    "リクエストされた項目が見つかりません。",
    "L’élément demandé est introuvable.",
    "O item solicitado não foi encontrado.",
    "تعذر العثور على العنصر المطلوب.",
    "요청한 항목을 찾을 수 없습니다.",
    "找不到要求的項目。",
    "Không tìm thấy mục được yêu cầu.",
    "Item yang diminta tidak ditemukan.",
  ],
  conflict: [
    "Esta solicitud entra en conflicto con el estado actual.",
    "该请求与当前状态冲突。",
    "यह अनुरोध मौजूदा स्थिति से मेल नहीं खाता।",
    "Diese Anfrage steht im Widerspruch zum aktuellen Status.",
    "現在の状態と競合するため、このリクエストを実行できません。",
    "Cette requête est incompatible avec l’état actuel.",
    "Esta solicitação entra em conflito com o estado atual.",
    "يتعارض هذا الطلب مع الحالة الحالية.",
    "현재 상태와 충돌하는 요청입니다.",
    "此要求與目前狀態衝突。",
    "Yêu cầu này xung đột với trạng thái hiện tại.",
    "Permintaan ini bertentangan dengan keadaan saat ini.",
  ],
  invalidData: [
    "Parte de la información enviada no es válida.",
    "提交的信息无效。",
    "दी गई कुछ जानकारी अमान्य है।",
    "Einige übermittelte Angaben sind ungültig.",
    "入力された情報の一部が無効です。",
    "Certaines informations envoyées sont invalides.",
    "Algumas informações enviadas são inválidas.",
    "بعض المعلومات المُدخلة غير صالحة.",
    "입력한 정보 중 일부가 올바르지 않습니다.",
    "提交的部分資訊無效。",
    "Một số thông tin đã gửi không hợp lệ.",
    "Sebagian informasi yang dikirim tidak valid.",
  ],
  rateLimited: [
    "Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.",
    "请求过多，请稍后再试。",
    "बहुत अधिक अनुरोध हैं। थोड़ी देर बाद फिर कोशिश करें।",
    "Zu viele Anfragen. Bitte warte kurz und versuche es erneut.",
    "リクエストが多すぎます。少し待ってから再試行してください。",
    "Trop de requêtes. Patientez un instant puis réessayez.",
    "Muitas solicitações. Aguarde um pouco e tente novamente.",
    "طلبات كثيرة جدًا. انتظر قليلًا ثم أعد المحاولة.",
    "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
    "要求過多，請稍候再試。",
    "Có quá nhiều yêu cầu. Hãy đợi một chút rồi thử lại.",
    "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
  ],
  upstreamUnavailable: [
    "Un servicio conectado no está disponible en este momento.",
    "连接的服务目前不可用。",
    "कनेक्ट की गई सेवा अभी उपलब्ध नहीं है।",
    "Ein verbundener Dienst ist momentan nicht verfügbar.",
    "接続先のサービスは現在利用できません。",
    "Un service connecté est indisponible pour le moment.",
    "Um serviço conectado está indisponível no momento.",
    "الخدمة المتصلة غير متاحة الآن.",
    "연결된 서비스를 현재 사용할 수 없습니다.",
    "連線的服務目前無法使用。",
    "Dịch vụ được kết nối hiện không khả dụng.",
    "Layanan yang terhubung sedang tidak tersedia.",
  ],
  serviceUnavailable: [
    "El servicio no está disponible temporalmente.",
    "服务暂时不可用。",
    "सेवा अस्थायी रूप से उपलब्ध नहीं है।",
    "Der Dienst ist vorübergehend nicht verfügbar.",
    "サービスは一時的に利用できません。",
    "Le service est temporairement indisponible.",
    "O serviço está temporariamente indisponível.",
    "الخدمة غير متاحة مؤقتًا.",
    "서비스를 일시적으로 사용할 수 없습니다.",
    "服務暫時無法使用。",
    "Dịch vụ tạm thời không khả dụng.",
    "Layanan sedang tidak tersedia untuk sementara.",
  ],
};

const LOCALE_ORDER: readonly InterfaceLanguage[] = [
  "es",
  "zh-Hans",
  "hi",
  "de",
  "ja",
  "fr",
  "pt-BR",
  "ar",
  "ko",
  "zh-Hant",
  "vi",
  "id",
];

export function getLocalizedApiErrorMessage(
  code: string | undefined,
  status: number,
  detail: string,
  language: InterfaceLanguage
): string {
  if (language === "en") return detail;
  const stableCode = code as ApiErrorCode | undefined;
  const resolvedCode =
    stableCode && Object.hasOwn(API_ERROR_CODE_TO_CATALOG_KEY, stableCode)
      ? stableCode
      : apiErrorCodeForStatus(status);
  const key = API_ERROR_CODE_TO_CATALOG_KEY[resolvedCode];
  const message = API_ERROR_MESSAGES[key][LOCALE_ORDER.indexOf(language)];
  if (!message) return detail;
  return detail ? `${message}: \u2068${detail}\u2069` : message;
}
