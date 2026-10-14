import type { InterfaceLanguage } from "@/lib/interface-locale";

type NotificationLabelKey =
  | "Notifications"
  | "Mark all notifications as read"
  | "Mark all as read"
  | "Clear all notifications"
  | "Clear all"
  | "No notifications"
  | "Read"
  | "Unread"
  | "notification"
  | "Read notification: {title}"
  | "Unread notification: {title}"
  | "Notifications, {count} unread"
  | "Game Released"
  | "Game Delayed"
  | "Import needs attention"
  | "Download Completed"
  | "Download Aborted"
  | "Download Failed"
  | "Download Started"
  | "Game Available"
  | "Multiple Results Found"
  | "Multiple Releases Found"
  | "Game Updates Available"
  | "Game Packs Available"
  | "Available on xREL.to"
  | "Steam Wishlist Synced"
  | "Import extraction failed"
  | "Auto-delete failed"
  | "Automated error report sent"
  | "Automated error report failed"
  | "An error occurred"
  | "Security Alert: Download Flagged by";

export const NOTIFICATION_LOCALES = [
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
] as const satisfies readonly InterfaceLanguage[];

const LABELS: Record<NotificationLabelKey, readonly string[]> = {
  Notifications: [
    "Notificaciones",
    "通知",
    "सूचनाएं",
    "Benachrichtigungen",
    "通知",
    "Notifications",
    "Notificações",
    "الإشعارات",
    "알림",
    "通知",
    "Thông báo",
    "Notifikasi",
  ],
  "Mark all notifications as read": [
    "Marcar todas las notificaciones como leídas",
    "将所有通知标记为已读",
    "सभी सूचनाओं को पढ़ा हुआ चिह्नित करें",
    "Alle Benachrichtigungen als gelesen markieren",
    "すべての通知を既読にする",
    "Tout marquer comme lu",
    "Marcar todas as notificações como lidas",
    "وضع علامة مقروء على كل الإشعارات",
    "모든 알림을 읽음으로 표시",
    "將所有通知標示為已讀",
    "Đánh dấu tất cả thông báo là đã đọc",
    "Tandai semua notifikasi telah dibaca",
  ],
  "Mark all as read": [
    "Marcar todo como leído",
    "全部标为已读",
    "सभी को पढ़ा हुआ चिह्नित करें",
    "Alle als gelesen markieren",
    "すべて既読にする",
    "Tout marquer comme lu",
    "Marcar tudo como lido",
    "وضع علامة مقروء على الكل",
    "모두 읽음으로 표시",
    "全部標示為已讀",
    "Đánh dấu tất cả đã đọc",
    "Tandai semua telah dibaca",
  ],
  "Clear all notifications": [
    "Borrar todas las notificaciones",
    "清除所有通知",
    "सभी सूचनाएं हटाएं",
    "Alle Benachrichtigungen löschen",
    "すべての通知を消去",
    "Effacer toutes les notifications",
    "Limpar todas as notificações",
    "مسح كل الإشعارات",
    "모든 알림 지우기",
    "清除所有通知",
    "Xóa tất cả thông báo",
    "Hapus semua notifikasi",
  ],
  "Clear all": [
    "Borrar todo",
    "全部清除",
    "सभी हटाएं",
    "Alle löschen",
    "すべて消去",
    "Tout effacer",
    "Limpar tudo",
    "مسح الكل",
    "모두 지우기",
    "全部清除",
    "Xóa tất cả",
    "Hapus semua",
  ],
  "No notifications": [
    "No hay notificaciones",
    "没有通知",
    "कोई सूचना नहीं है",
    "Keine Benachrichtigungen",
    "通知はありません",
    "Aucune notification",
    "Nenhuma notificação",
    "لا توجد إشعارات",
    "알림이 없습니다",
    "沒有通知",
    "Không có thông báo",
    "Tidak ada notifikasi",
  ],
  Read: [
    "Leída",
    "已读",
    "पढ़ा हुआ",
    "Gelesen",
    "既読",
    "Lu",
    "Lida",
    "مقروء",
    "읽음",
    "已讀",
    "Đã đọc",
    "Dibaca",
  ],
  Unread: [
    "Sin leer",
    "未读",
    "अपठित",
    "Ungelesen",
    "未読",
    "Non lu",
    "Não lida",
    "غير مقروء",
    "읽지 않음",
    "未讀",
    "Chưa đọc",
    "Belum dibaca",
  ],
  notification: [
    "notificación",
    "通知",
    "सूचना",
    "Benachrichtigung",
    "通知",
    "notification",
    "notificação",
    "إشعار",
    "알림",
    "通知",
    "thông báo",
    "notifikasi",
  ],
  "Read notification: {title}": [
    "Notificación leída: {title}",
    "已读通知：{title}",
    "पढ़ी हुई सूचना: {title}",
    "Gelesene Benachrichtigung: {title}",
    "既読の通知: {title}",
    "Notification lue : {title}",
    "Notificação lida: {title}",
    "إشعار مقروء: {title}",
    "읽은 알림: {title}",
    "已讀通知：{title}",
    "Thông báo đã đọc: {title}",
    "Notifikasi dibaca: {title}",
  ],
  "Unread notification: {title}": [
    "Notificación sin leer: {title}",
    "未读通知：{title}",
    "अपठित सूचना: {title}",
    "Ungelesene Benachrichtigung: {title}",
    "未読の通知: {title}",
    "Notification non lue : {title}",
    "Notificação não lida: {title}",
    "إشعار غير مقروء: {title}",
    "읽지 않은 알림: {title}",
    "未讀通知：{title}",
    "Thông báo chưa đọc: {title}",
    "Notifikasi belum dibaca: {title}",
  ],
  "Notifications, {count} unread": [
    "Notificaciones, {count} sin leer",
    "通知，{count} 条未读",
    "सूचनाएं, {count} अपठित",
    "Benachrichtigungen, {count} ungelesen",
    "通知、未読 {count} 件",
    "Notifications, {count} non lues",
    "Notificações, {count} não lidas",
    "الإشعارات، غير مقروءة: {count}",
    "알림, 읽지 않음 {count}개",
    "通知，{count} 則未讀",
    "Thông báo, {count} chưa đọc",
    "Notifikasi, {count} belum dibaca",
  ],
  "Game Released": [
    "Juego lanzado",
    "游戏已发行",
    "गेम जारी हुआ",
    "Spiel erschienen",
    "ゲーム発売",
    "Jeu sorti",
    "Jogo lançado",
    "صدرت اللعبة",
    "게임 출시",
    "遊戲已發行",
    "Trò chơi đã phát hành",
    "Game dirilis",
  ],
  "Game Delayed": [
    "Lanzamiento retrasado",
    "游戏延期",
    "गेम में देरी",
    "Spiel verschoben",
    "ゲーム延期",
    "Jeu retardé",
    "Jogo adiado",
    "تأجل إصدار اللعبة",
    "게임 출시 연기",
    "遊戲延期",
    "Trò chơi bị hoãn",
    "Game ditunda",
  ],
  "Import needs attention": [
    "La importación requiere atención",
    "导入需要处理",
    "आयात पर ध्यान देना आवश्यक है",
    "Import erfordert Aufmerksamkeit",
    "インポートの確認が必要です",
    "Importation à vérifier",
    "A importação precisa de atenção",
    "الاستيراد يحتاج إلى مراجعة",
    "가져오기 확인 필요",
    "匯入需要處理",
    "Cần xử lý bản nhập",
    "Impor perlu perhatian",
  ],
  "Download Completed": [
    "Descarga completada",
    "下载完成",
    "डाउनलोड पूरा हुआ",
    "Download abgeschlossen",
    "ダウンロード完了",
    "Téléchargement terminé",
    "Download concluído",
    "اكتمل التنزيل",
    "다운로드 완료",
    "下載完成",
    "Đã tải xuống",
    "Unduhan selesai",
  ],
  "Download Aborted": [
    "Descarga interrumpida",
    "下载已中止",
    "डाउनलोड रोक दिया गया",
    "Download abgebrochen",
    "ダウンロード中止",
    "Téléchargement interrompu",
    "Download interrompido",
    "أُوقف التنزيل",
    "다운로드 중단",
    "下載已中止",
    "Đã hủy tải xuống",
    "Unduhan dibatalkan",
  ],
  "Download Failed": [
    "Error en la descarga",
    "下载失败",
    "डाउनलोड विफल",
    "Download fehlgeschlagen",
    "ダウンロード失敗",
    "Échec du téléchargement",
    "Falha no download",
    "فشل التنزيل",
    "다운로드 실패",
    "下載失敗",
    "Tải xuống thất bại",
    "Unduhan gagal",
  ],
  "Download Started": [
    "Descarga iniciada",
    "下载已开始",
    "डाउनलोड शुरू हुआ",
    "Download gestartet",
    "ダウンロード開始",
    "Téléchargement lancé",
    "Download iniciado",
    "بدأ التنزيل",
    "다운로드 시작",
    "下載已開始",
    "Đã bắt đầu tải xuống",
    "Unduhan dimulai",
  ],
  "Game Available": [
    "Juego disponible",
    "游戏已可下载",
    "गेम उपलब्ध है",
    "Spiel verfügbar",
    "ダウンロード可能",
    "Jeu disponible",
    "Jogo disponível",
    "اللعبة متاحة",
    "게임 이용 가능",
    "遊戲已可下載",
    "Trò chơi đã có",
    "Game tersedia",
  ],
  "Multiple Results Found": [
    "Se encontraron varios resultados",
    "找到多个结果",
    "कई परिणाम मिले",
    "Mehrere Ergebnisse gefunden",
    "複数の結果が見つかりました",
    "Plusieurs résultats trouvés",
    "Vários resultados encontrados",
    "عُثر على نتائج متعددة",
    "여러 결과를 찾았습니다",
    "找到多個結果",
    "Tìm thấy nhiều kết quả",
    "Beberapa hasil ditemukan",
  ],
  "Multiple Releases Found": [
    "Se encontraron varios lanzamientos",
    "找到多个发行版本",
    "कई रिलीज़ मिलीं",
    "Mehrere Releases gefunden",
    "複数のリリースが見つかりました",
    "Plusieurs versions trouvées",
    "Vários lançamentos encontrados",
    "عُثر على إصدارات متعددة",
    "여러 릴리스를 찾았습니다",
    "找到多個發行版本",
    "Tìm thấy nhiều bản phát hành",
    "Beberapa rilis ditemukan",
  ],
  "Game Updates Available": [
    "Hay actualizaciones disponibles",
    "有游戏更新",
    "गेम अपडेट उपलब्ध हैं",
    "Spielupdates verfügbar",
    "ゲームアップデートがあります",
    "Mises à jour disponibles",
    "Há atualizações disponíveis",
    "تحديثات اللعبة متاحة",
    "게임 업데이트 사용 가능",
    "有遊戲更新",
    "Có bản cập nhật trò chơi",
    "Pembaruan game tersedia",
  ],
  "Game Packs Available": [
    "Hay paquetes del juego disponibles",
    "有游戏内容包可用",
    "गेम पैक उपलब्ध हैं",
    "Spielpakete verfügbar",
    "ゲームパックがあります",
    "Packs de jeu disponibles",
    "Há pacotes do jogo disponíveis",
    "حزم اللعبة متاحة",
    "게임 팩 사용 가능",
    "有遊戲內容包可用",
    "Có gói trò chơi",
    "Paket game tersedia",
  ],
  "Available on xREL.to": [
    "Disponible en xREL.to",
    "xREL.to 上有资源",
    "xREL.to पर उपलब्ध",
    "Auf xREL.to verfügbar",
    "xREL.to で入手可能",
    "Disponible sur xREL.to",
    "Disponível no xREL.to",
    "متاح على xREL.to",
    "xREL.to에서 이용 가능",
    "xREL.to 上有資源",
    "Có trên xREL.to",
    "Tersedia di xREL.to",
  ],
  "Steam Wishlist Synced": [
    "Lista de deseos de Steam sincronizada",
    "Steam 愿望单已同步",
    "Steam विशलिस्ट सिंक हुई",
    "Steam-Wunschliste synchronisiert",
    "Steamのウィッシュリストを同期しました",
    "Liste de souhaits Steam synchronisée",
    "Lista de desejos da Steam sincronizada",
    "تمت مزامنة قائمة أمنيات Steam",
    "Steam 위시리스트 동기화 완료",
    "Steam 願望清單已同步",
    "Đã đồng bộ danh sách mong muốn Steam",
    "Wishlist Steam disinkronkan",
  ],
  "Import extraction failed": [
    "Error al extraer la importación",
    "导入解压失败",
    "आयात निष्कर्षण विफल",
    "Import-Entpacken fehlgeschlagen",
    "インポートの展開に失敗しました",
    "Échec de l’extraction à l’importation",
    "Falha ao extrair a importação",
    "فشل فك الملفات أثناء الاستيراد",
    "가져오기 압축 해제 실패",
    "匯入解壓失敗",
    "Giải nén khi nhập thất bại",
    "Ekstraksi impor gagal",
  ],
  "Auto-delete failed": [
    "Error al eliminar automáticamente",
    "自动删除失败",
    "अपने आप हटाना विफल",
    "Automatisches Löschen fehlgeschlagen",
    "自動削除に失敗しました",
    "Échec de la suppression automatique",
    "Falha ao excluir automaticamente",
    "فشل الحذف التلقائي",
    "자동 삭제 실패",
    "自動刪除失敗",
    "Tự động xóa thất bại",
    "Gagal menghapus otomatis",
  ],
  "Automated error report sent": [
    "Informe de errores automático enviado",
    "自动错误报告已发送",
    "स्वचालित त्रुटि रिपोर्ट भेजी गई",
    "Automatischer Fehlerbericht gesendet",
    "自動エラーレポートを送信しました",
    "Rapport d’erreur automatique envoyé",
    "Relatório automático de erros enviado",
    "أُرسل تقرير الأخطاء التلقائي",
    "자동 오류 보고서 전송 완료",
    "自動錯誤報告已傳送",
    "Đã gửi báo cáo lỗi tự động",
    "Laporan kesalahan otomatis terkirim",
  ],
  "Automated error report failed": [
    "No se pudo enviar el informe de errores automático",
    "自动错误报告发送失败",
    "स्वचालित त्रुटि रिपोर्ट नहीं भेजी जा सकी",
    "Automatischer Fehlerbericht konnte nicht gesendet werden",
    "自動エラーレポートを送信できませんでした",
    "Échec de l’envoi du rapport d’erreur automatique",
    "Falha ao enviar o relatório automático de erros",
    "تعذر إرسال تقرير الأخطاء التلقائي",
    "자동 오류 보고서를 보내지 못했습니다",
    "自動錯誤報告傳送失敗",
    "Không gửi được báo cáo lỗi tự động",
    "Laporan kesalahan otomatis gagal dikirim",
  ],
  "An error occurred": [
    "Se produjo un error",
    "发生错误",
    "एक त्रुटि हुई",
    "Ein Fehler ist aufgetreten",
    "エラーが発生しました",
    "Une erreur s’est produite",
    "Ocorreu um erro",
    "حدث خطأ",
    "오류가 발생했습니다",
    "發生錯誤",
    "Đã xảy ra lỗi",
    "Terjadi kesalahan",
  ],
  "Security Alert: Download Flagged by": [
    "Alerta de seguridad: descarga señalada por",
    "安全警报：下载被以下服务标记",
    "सुरक्षा चेतावनी: डाउनलोड को इस सेवा ने चिह्नित किया",
    "Sicherheitswarnung: Download markiert durch",
    "セキュリティ警告: ダウンロードを検出したサービス",
    "Alerte de sécurité : téléchargement signalé par",
    "Alerta de segurança: download sinalizado por",
    "تنبيه أمني: تم الإبلاغ عن التنزيل بواسطة",
    "보안 경고: 다운로드를 탐지한 서비스",
    "安全警示：下載被以下服務標記",
    "Cảnh báo bảo mật: lượt tải bị đánh dấu bởi",
    "Peringatan keamanan: unduhan ditandai oleh",
  ],
};

export function getNotificationLabel(source: string, language: InterfaceLanguage): string {
  if (language === "en") return source;
  const row = LABELS[source as NotificationLabelKey];
  const translation =
    row?.[NOTIFICATION_LOCALES.indexOf(language as (typeof NOTIFICATION_LOCALES)[number])];
  return translation || source;
}

export function getNotificationTitle(source: string, language: InterfaceLanguage): string {
  if (source.startsWith("Security Alert: Download Flagged by ")) {
    const provider = source.slice("Security Alert: Download Flagged by ".length);
    const prefix = getNotificationLabel("Security Alert: Download Flagged by", language);
    return prefix === "Security Alert: Download Flagged by" ? source : `${prefix} ${provider}`;
  }
  return getNotificationLabel(source, language);
}

export function getNotificationTitleLanguage(
  source: string,
  language: InterfaceLanguage
): InterfaceLanguage {
  if (language === "en") return "en";
  if (source.startsWith("Security Alert: Download Flagged by ")) return language;
  return LABELS[source as NotificationLabelKey] ? language : "en";
}

export function getNotificationTextDirection(language: InterfaceLanguage): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

export function formatNotificationAccessibleLabel(
  read: boolean,
  title: string,
  language: InterfaceLanguage
): string {
  const template = getNotificationLabel(
    read ? "Read notification: {title}" : "Unread notification: {title}",
    language
  );
  return template.replace("{title}", title);
}

export function formatUnreadNotificationsLabel(count: number, language: InterfaceLanguage): string {
  const template = getNotificationLabel("Notifications, {count} unread", language);
  return template.replace("{count}", new Intl.NumberFormat(language).format(count));
}
