import type { ReactNode } from "react";
import type { InterfaceLanguage } from "@/lib/interface-locale";
import { getNotificationTextDirection, NOTIFICATION_LOCALES } from "@/lib/notification-locale";
type MessageKey =
  | "gameReleased"
  | "gameDelayed"
  | "downloadFinished"
  | "importRemotePath"
  | "importLocalPath"
  | "downloadAborted"
  | "downloadFailed"
  | "releaseReview"
  | "downloadStarted"
  | "gameAvailable"
  | "multipleResults"
  | "updatesAvailable"
  | "packsAvailable"
  | "xrelAvailable"
  | "steamSynced"
  | "importExtractionFailed"
  | "autoDeleteFailed"
  | "errorReportSent"
  | "errorReportFailed"
  | "errorOccurred"
  | "securityFlagged";
type MessageParams = Record<string, string>;
const MESSAGES: Record<MessageKey, readonly string[]> = {
  gameReleased: [
    "¡{game} ya está a la venta!",
    "{game} 已发行！",
    "{game} जारी हो गया है!",
    "{game} ist erschienen!",
    "{game} が発売されました！",
    "{game} est sorti !",
    "{game} foi lançado!",
    "صدرت لعبة {game}!",
    "{game}이(가) 출시되었습니다!",
    "{game} 已發行！",
    "{game} đã phát hành!",
    "{game} telah dirilis!",
  ],
  gameDelayed: [
    "{game} se ha retrasado hasta el {date}.",
    "{game} 已延期至 {date}。",
    "{game} की रिलीज़ {date} तक टल गई है।",
    "{game} wurde auf den {date} verschoben.",
    "{game} の発売日は {date} に延期されました。",
    "La sortie de {game} est reportée au {date}.",
    "{game} foi adiado para {date}.",
    "تأجل إصدار {game} إلى {date}.",
    "{game} 출시가 {date}(으)로 연기되었습니다.",
    "{game} 已延期至 {date}。",
    "{game} đã bị hoãn đến ngày {date}.",
    "{game} ditunda hingga {date}.",
  ],
  downloadFinished: [
    "La descarga de {game} ha terminado.",
    "{game} 已下载完成。",
    "{game} का डाउनलोड पूरा हुआ।",
    "Der Download von {game} ist abgeschlossen.",
    "{game} のダウンロードが完了しました。",
    "Le téléchargement de {game} est terminé.",
    "O download de {game} foi concluído.",
    "اكتمل تنزيل {game}.",
    "{game} 다운로드가 완료되었습니다.",
    "{game} 已下載完成。",
    "Đã tải xong {game}.",
    "Unduhan {game} selesai.",
  ],
  importRemotePath: [
    "La descarga de {game} terminó, pero no se pudo resolver la ruta del archivo desde el cliente. Revisa Ajustes → Asignaciones de rutas o inicia la importación manualmente.",
    "{game} 已下载完成，但无法从下载客户端解析文件路径。请检查“设置 → 路径映射”，或手动开始导入。",
    "{game} का डाउनलोड पूरा हुआ, लेकिन डाउनलोड क्लाइंट से फ़ाइल पथ नहीं मिला। सेटिंग्स → पथ मैपिंग देखें या आयात मैन्युअल रूप से शुरू करें।",
    "{game} wurde heruntergeladen, aber der Dateipfad konnte nicht vom Download-Client ermittelt werden. Prüfe Einstellungen → Pfadzuordnungen oder starte den Import manuell.",
    "{game} のダウンロードは完了しましたが、ダウンロードクライアントからファイルパスを取得できませんでした。設定 → パスマッピングを確認するか、手動でインポートしてください。",
    "Le téléchargement de {game} est terminé, mais le client n’a pas fourni le chemin du fichier. Vérifiez Paramètres → Correspondances des chemins ou lancez l’importation manuellement.",
    "O download de {game} terminou, mas não foi possível obter o caminho do arquivo no cliente. Confira Configurações → Mapeamentos de caminho ou inicie a importação manualmente.",
    "اكتمل تنزيل {game}، لكن تعذر تحديد مسار الملف من عميل التنزيل. راجع الإعدادات ← تعيينات المسارات أو ابدأ الاستيراد يدويًا.",
    "{game} 다운로드가 완료되었지만 다운로드 클라이언트에서 파일 경로를 확인할 수 없습니다. 설정 → 경로 매핑을 확인하거나 직접 가져오기를 시작하세요.",
    "{game} 已下載完成，但無法從下載用戶端解析檔案路徑。請檢查「設定 → 路徑對應」，或手動開始匯入。",
    "Đã tải xong {game}, nhưng không lấy được đường dẫn tệp từ trình tải xuống. Hãy kiểm tra Cài đặt → Ánh xạ đường dẫn hoặc tự bắt đầu nhập.",
    "Unduhan {game} selesai, tetapi jalur berkas tidak dapat ditemukan dari klien unduhan. Periksa Pengaturan → Pemetaan jalur atau mulai impor secara manual.",
  ],
  importLocalPath: [
    "La descarga de {game} terminó, pero no se pudo acceder a la ruta local. Revisa Ajustes → Asignaciones de rutas o inicia la importación manualmente.",
    "{game} 已下载完成，但无法访问本地路径。请检查“设置 → 路径映射”，或手动开始导入。",
    "{game} का डाउनलोड पूरा हुआ, लेकिन स्थानीय पथ तक पहुंच नहीं मिली। सेटिंग्स → पथ मैपिंग देखें या आयात मैन्युअल रूप से शुरू करें।",
    "{game} wurde heruntergeladen, aber der lokale Pfad ist nicht erreichbar. Prüfe Einstellungen → Pfadzuordnungen oder starte den Import manuell.",
    "{game} のダウンロードは完了しましたが、ローカルパスにアクセスできません。設定 → パスマッピングを確認するか、手動でインポートしてください。",
    "Le téléchargement de {game} est terminé, mais le chemin local est inaccessible. Vérifiez Paramètres → Correspondances des chemins ou lancez l’importation manuellement.",
    "O download de {game} terminou, mas não foi possível acessar o caminho local. Confira Configurações → Mapeamentos de caminho ou inicie a importação manualmente.",
    "اكتمل تنزيل {game}، لكن تعذر الوصول إلى المسار المحلي. راجع الإعدادات ← تعيينات المسارات أو ابدأ الاستيراد يدويًا.",
    "{game} 다운로드가 완료되었지만 로컬 경로에 접근할 수 없습니다. 설정 → 경로 매핑을 확인하거나 직접 가져오기를 시작하세요.",
    "{game} 已下載完成，但無法存取本機路徑。請檢查「設定 → 路徑對應」，或手動開始匯入。",
    "Đã tải xong {game}, nhưng không thể truy cập đường dẫn cục bộ. Hãy kiểm tra Cài đặt → Ánh xạ đường dẫn hoặc tự bắt đầu nhập.",
    "Unduhan {game} selesai, tetapi jalur lokal tidak dapat diakses. Periksa Pengaturan → Pemetaan jalur atau mulai impor secara manual.",
  ],
  downloadAborted: [
    "Se interrumpió la descarga de {game}: {error}",
    "{game} 的下载已中止：{error}",
    "{game} का डाउनलोड रोक दिया गया: {error}",
    "Der Download von {game} wurde abgebrochen: {error}",
    "{game} のダウンロードが中止されました: {error}",
    "Le téléchargement de {game} a été interrompu : {error}",
    "O download de {game} foi interrompido: {error}",
    "أُوقف تنزيل {game}: {error}",
    "{game} 다운로드가 중단되었습니다: {error}",
    "{game} 的下載已中止：{error}",
    "Đã hủy tải {game}: {error}",
    "Unduhan {game} dibatalkan: {error}",
  ],
  downloadFailed: [
    "La descarga de {game} desapareció del cliente antes de terminar y se marcó como fallida. Si terminó, quizá debas importarla manualmente.",
    "{game} 的下载在完成前从下载客户端消失，已标记为失败。如果实际已完成，可能需要手动导入。",
    "{game} का डाउनलोड पूरा होने से पहले क्लाइंट से हट गया और इसे विफल चिह्नित किया गया। यदि डाउनलोड पूरा हो गया था, तो इसे मैन्युअल रूप से आयात करना पड़ सकता है।",
    "Der Download von {game} verschwand vor dem Abschluss aus dem Client und wurde als fehlgeschlagen markiert. Falls er tatsächlich fertig war, musst du ihn möglicherweise manuell importieren.",
    "{game} のダウンロードは完了前にクライアントから消えたため、失敗として記録されました。実際には完了していた場合、手動でインポートしてください。",
    "Le téléchargement de {game} a disparu du client avant la fin et a été marqué comme échoué. S’il est bien terminé, vous devrez peut-être l’importer manuellement.",
    "O download de {game} sumiu do cliente antes de terminar e foi marcado como falha. Se ele tiver sido concluído, talvez seja necessário importá-lo manualmente.",
    "اختفى تنزيل {game} من العميل قبل اكتماله وتم وضع علامة فشل عليه. إذا كان قد اكتمل بالفعل، فقد تحتاج إلى استيراده يدويًا.",
    "{game} 다운로드가 완료되기 전에 클라이언트에서 사라져 실패로 표시되었습니다. 실제로 완료되었다면 직접 가져와야 할 수 있습니다.",
    "{game} 的下載在完成前從下載用戶端消失，已標示為失敗。如果實際已完成，可能需要手動匯入。",
    "Tải xuống {game} biến mất khỏi trình tải trước khi hoàn tất và đã được đánh dấu thất bại. Nếu thực tế đã tải xong, bạn có thể cần tự nhập trò chơi.",
    "Unduhan {game} menghilang dari klien sebelum selesai dan ditandai gagal. Jika sebenarnya sudah selesai, Anda mungkin perlu mengimpornya secara manual.",
  ],
  releaseReview: [
    "{game}: {reason}. Revísalo y elige una opción.",
    "{game}：{reason}。请检查并选择。",
    "{game}: {reason}। कृपया समीक्षा करके चुनें।",
    "{game}: {reason}. Bitte prüfen und auswählen.",
    "{game}: {reason}。内容を確認して選択してください。",
    "{game} : {reason}. Vérifiez et choisissez.",
    "{game}: {reason}. Revise e escolha.",
    "{game}: {reason}. يُرجى المراجعة والاختيار.",
    "{game}: {reason}. 검토한 뒤 선택하세요.",
    "{game}：{reason}。請檢查並選擇。",
    "{game}: {reason}. Hãy xem xét và chọn.",
    "{game}: {reason}. Tinjau dan pilih.",
  ],
  downloadStarted: [
    "Se inició la descarga de {release} mediante {method}.",
    "已通过 {method} 开始下载 {release}。",
    "{method} के माध्यम से {release} का डाउनलोड शुरू हुआ।",
    "Der Download von {release} über {method} wurde gestartet.",
    "{method} で {release} のダウンロードを開始しました。",
    "Téléchargement de {release} lancé via {method}.",
    "O download de {release} foi iniciado via {method}.",
    "بدأ تنزيل {release} عبر {method}.",
    "{method}(으)로 {release} 다운로드를 시작했습니다.",
    "已透過 {method} 開始下載 {release}。",
    "Đã bắt đầu tải {release} qua {method}.",
    "Unduhan {release} dimulai melalui {method}.",
  ],
  gameAvailable: [
    "{game} ya está disponible para descargar.",
    "{game} 现已可以下载。",
    "{game} अब डाउनलोड के लिए उपलब्ध है।",
    "{game} ist jetzt zum Download verfügbar.",
    "{game} がダウンロード可能になりました。",
    "{game} est maintenant disponible au téléchargement.",
    "{game} já está disponível para download.",
    "أصبحت {game} متاحة للتنزيل الآن.",
    "{game}을(를) 이제 다운로드할 수 있습니다.",
    "{game} 現在可以下載。",
    "{game} hiện đã có thể tải xuống.",
    "{game} kini tersedia untuk diunduh.",
  ],
  multipleResults: [
    "Se encontraron {count} resultados para {game}. Revísalos y elige una opción.",
    "找到 {game} 的 {count} 个结果。请检查并选择。",
    "{game} के {count} परिणाम मिले। कृपया समीक्षा करके चुनें।",
    "{count} Ergebnisse für {game} gefunden. Bitte prüfen und auswählen.",
    "{game} の検索結果が {count} 件見つかりました。確認して選択してください。",
    "{count} résultats trouvés pour {game}. Vérifiez et choisissez.",
    "Foram encontrados {count} resultados para {game}. Revise e escolha.",
    "عُثر على {count} نتائج لـ {game}. يُرجى المراجعة والاختيار.",
    "{game} 검색 결과 {count}개를 찾았습니다. 검토한 뒤 선택하세요.",
    "找到 {game} 的 {count} 個結果。請檢查並選擇。",
    "Tìm thấy {count} kết quả cho {game}. Hãy xem xét và chọn.",
    "Ditemukan {count} hasil untuk {game}. Tinjau dan pilih.",
  ],
  updatesAvailable: [
    "Se encontraron {count} actualizaciones para {game}.",
    "找到 {game} 的 {count} 个更新。",
    "{game} के {count} अपडेट मिले।",
    "{count} Updates für {game} gefunden.",
    "{game} のアップデートが {count} 件見つかりました。",
    "{count} mises à jour trouvées pour {game}.",
    "Foram encontradas {count} atualizações para {game}.",
    "عُثر على {count} تحديثات لـ {game}.",
    "{game} 업데이트 {count}개를 찾았습니다.",
    "找到 {game} 的 {count} 個更新。",
    "Tìm thấy {count} bản cập nhật cho {game}.",
    "Ditemukan {count} pembaruan untuk {game}.",
  ],
  packsAvailable: [
    "Se encontraron {count} paquetes o complementos para {game}.",
    "找到 {game} 的 {count} 个内容包或附加内容。",
    "{game} के {count} पैक या ऐड-ऑन मिले।",
    "{count} Pakete oder Add-ons für {game} gefunden.",
    "{game} のパックまたは追加コンテンツが {count} 件見つかりました。",
    "{count} packs ou extensions trouvés pour {game}.",
    "Foram encontrados {count} pacotes ou complementos para {game}.",
    "عُثر على {count} حزم أو إضافات لـ {game}.",
    "{game} 팩 또는 추가 콘텐츠 {count}개를 찾았습니다.",
    "找到 {game} 的 {count} 個內容包或附加內容。",
    "Tìm thấy {count} gói hoặc tiện ích bổ sung cho {game}.",
    "Ditemukan {count} paket atau add-on untuk {game}.",
  ],
  xrelAvailable: [
    "{game} aparece en xREL.to: {release}",
    "{game} 已列在 xREL.to：{release}",
    "{game} xREL.to पर सूचीबद्ध है: {release}",
    "{game} ist auf xREL.to gelistet: {release}",
    "{game} が xREL.to に掲載されています: {release}",
    "{game} est répertorié sur xREL.to : {release}",
    "{game} está listado no xREL.to: {release}",
    "{game} مُدرجة على xREL.to: {release}",
    "{game}이(가) xREL.to에 등록되었습니다: {release}",
    "{game} 已列在 xREL.to：{release}",
    "{game} được liệt kê trên xREL.to: {release}",
    "{game} tercantum di xREL.to: {release}",
  ],
  steamSynced: [
    "Se añadieron correctamente {count} juegos de tu lista de deseos de Steam.",
    "已从 Steam 愿望单成功添加 {count} 款游戏。",
    "आपकी Steam विशलिस्ट से {count} गेम सफलतापूर्वक जोड़े गए।",
    "{count} Spiele wurden erfolgreich von deiner Steam-Wunschliste hinzugefügt.",
    "Steamのウィッシュリストから{count}本のゲームを追加しました。",
    "{count} jeux ont été ajoutés depuis votre liste de souhaits Steam.",
    "{count} jogos foram adicionados à sua lista a partir da lista de desejos da Steam.",
    "تمت إضافة {count} لعبة من قائمة أمنيات Steam بنجاح.",
    "Steam 위시리스트에서 게임 {count}개를 추가했습니다.",
    "已從 Steam 願望清單成功新增 {count} 款遊戲。",
    "Đã thêm thành công {count} trò chơi từ danh sách mong muốn Steam.",
    "Berhasil menambahkan {count} game dari wishlist Steam Anda.",
  ],
  importExtractionFailed: [
    "{game} se movió a tu biblioteca, pero no se pudo extraer el archivo: {error}. El archivo está en {path}. Extráelo o elimínalo manualmente para terminar la importación.",
    "{game} 已移入媒体库，但解压文件失败：{error}。压缩包位于 {path}。请手动解压或删除它以完成导入。",
    "{game} को लाइब्रेरी में ले जाया गया, लेकिन संग्रह निकालना विफल रहा: {error}। संग्रह {path} पर है। आयात पूरा करने के लिए इसे मैन्युअल रूप से निकालें या हटाएं।",
    "{game} wurde in die Bibliothek verschoben, aber das Archiv konnte nicht entpackt werden: {error}. Das Archiv liegt unter {path}. Entpacke oder lösche es manuell, um den Import abzuschließen.",
    "{game} はライブラリに移動しましたが、アーカイブを展開できませんでした: {error}。アーカイブは {path} にあります。インポートを完了するには手動で展開するか削除してください。",
    "{game} a été déplacé dans votre bibliothèque, mais l’archive n’a pas pu être extraite : {error}. Elle se trouve ici : {path}. Extrayez-la ou supprimez-la manuellement pour terminer l’importation.",
    "{game} foi movido para a biblioteca, mas não foi possível extrair o arquivo: {error}. O arquivo está em {path}. Extraia ou exclua manualmente para concluir a importação.",
    "نُقلت {game} إلى مكتبتك، لكن تعذر فك الأرشيف: {error}. الأرشيف موجود في {path}. فكّه أو احذفه يدويًا لإكمال الاستيراد.",
    "{game}을(를) 라이브러리로 옮겼지만 압축 파일을 풀지 못했습니다: {error}. 압축 파일은 {path}에 있습니다. 가져오기를 마치려면 직접 압축을 풀거나 삭제하세요.",
    "{game} 已移至媒體庫，但解壓檔案失敗：{error}。壓縮檔位於 {path}。請手動解壓或刪除，以完成匯入。",
    "Đã chuyển {game} vào thư viện nhưng không thể giải nén kho lưu trữ: {error}. Tệp nằm tại {path}. Hãy tự giải nén hoặc xóa để hoàn tất việc nhập.",
    "{game} dipindahkan ke pustaka, tetapi arsip gagal diekstrak: {error}. Arsip berada di {path}. Ekstrak atau hapus secara manual untuk menyelesaikan impor.",
  ],
  autoDeleteFailed: [
    "{game} se importó correctamente, pero no se pudo eliminar del cliente de descargas: {error}. Elimínalo manualmente.",
    "{game} 已成功导入，但无法从下载客户端删除：{error}。请手动删除。",
    "{game} सफलतापूर्वक आयात हुआ, लेकिन डाउनलोड क्लाइंट से हटाया नहीं जा सका: {error}। इसे मैन्युअल रूप से हटाएं।",
    "{game} wurde erfolgreich importiert, konnte aber nicht aus dem Download-Client gelöscht werden: {error}. Lösche es manuell.",
    "{game} は正常にインポートされましたが、ダウンロードクライアントから削除できませんでした: {error}。手動で削除してください。",
    "{game} a bien été importé, mais sa suppression du client de téléchargement a échoué : {error}. Supprimez-le manuellement.",
    "{game} foi importado, mas não foi possível removê-lo do cliente de download: {error}. Remova-o manualmente.",
    "تم استيراد {game} بنجاح، لكن تعذر حذفه من عميل التنزيل: {error}. يُرجى حذفه يدويًا.",
    "{game}을(를) 가져왔지만 다운로드 클라이언트에서 제거하지 못했습니다: {error}. 직접 삭제하세요.",
    "{game} 已成功匯入，但無法從下載用戶端刪除：{error}。請手動刪除。",
    "Đã nhập {game} nhưng không thể xóa khỏi trình tải xuống: {error}. Hãy tự xóa.",
    "{game} berhasil diimpor, tetapi tidak dapat dihapus dari klien unduhan: {error}. Hapus secara manual.",
  ],
  errorReportSent: [
    "Questarr detectó un error y envió un informe de diagnóstico automáticamente. Código de soporte: {code}.",
    "Questarr 检测到错误并自动发送了诊断报告。支持代码：{code}。",
    "Questarr ने त्रुटि पहचानी और निदान रिपोर्ट अपने आप भेजी। सहायता कोड: {code}।",
    "Questarr hat einen Fehler erkannt und automatisch einen Diagnosebericht gesendet. Support-Code: {code}.",
    "Questarr がエラーを検出し、診断レポートを自動送信しました。サポートコード: {code}。",
    "Questarr a détecté une erreur et envoyé automatiquement un rapport de diagnostic. Code d’assistance : {code}.",
    "O Questarr detectou um erro e enviou automaticamente um relatório de diagnóstico. Código de suporte: {code}.",
    "اكتشف Questarr خطأ وأرسل تقرير تشخيص تلقائيًا. رمز الدعم: {code}.",
    "Questarr에서 오류를 감지해 진단 보고서를 자동으로 보냈습니다. 지원 코드: {code}.",
    "Questarr 偵測到錯誤並自動傳送診斷報告。支援代碼：{code}。",
    "Questarr phát hiện lỗi và tự động gửi báo cáo chẩn đoán. Mã hỗ trợ: {code}.",
    "Questarr mendeteksi kesalahan dan otomatis mengirim laporan diagnostik. Kode dukungan: {code}.",
  ],
  errorReportFailed: [
    "Questarr detectó un error, pero no pudo enviar el informe de diagnóstico automático ({error}).",
    "Questarr 检测到错误，但无法发送自动诊断报告（{error}）。",
    "Questarr ने त्रुटि पहचानी, लेकिन स्वचालित निदान रिपोर्ट नहीं भेज सका ({error})।",
    "Questarr hat einen Fehler erkannt, konnte den automatischen Diagnosebericht aber nicht senden ({error}).",
    "Questarr がエラーを検出しましたが、自動診断レポートを送信できませんでした ({error})。",
    "Questarr a détecté une erreur, mais n’a pas pu envoyer le rapport de diagnostic automatique ({error}).",
    "O Questarr detectou um erro, mas não conseguiu enviar o relatório automático de diagnóstico ({error}).",
    "اكتشف Questarr خطأ، لكنه تعذر عليه إرسال تقرير التشخيص التلقائي ({error}).",
    "Questarr에서 오류를 감지했지만 자동 진단 보고서를 보내지 못했습니다({error}).",
    "Questarr 偵測到錯誤，但無法傳送自動診斷報告（{error}）。",
    "Questarr phát hiện lỗi nhưng không thể gửi báo cáo chẩn đoán tự động ({error}).",
    "Questarr mendeteksi kesalahan, tetapi gagal mengirim laporan diagnostik otomatis ({error}).",
  ],
  errorOccurred: [
    "Questarr encontró un error inesperado. Selecciona para revisarlo y, si quieres, enviar un informe de diagnóstico para ayudar a corregirlo.",
    "Questarr 遇到意外错误。点击查看，并可选择发送诊断报告来协助修复问题。",
    "Questarr में अप्रत्याशित त्रुटि हुई। इसकी समीक्षा करने और समस्या ठीक करने में मदद के लिए निदान रिपोर्ट भेजने हेतु क्लिक करें।",
    "Questarr ist auf einen unerwarteten Fehler gestoßen. Klicke hier, um ihn zu prüfen und bei Bedarf einen Diagnosebericht zur Fehlerbehebung zu senden.",
    "Questarr で予期しないエラーが発生しました。クリックして確認し、修正に役立つ診断レポートを送信するか選択してください。",
    "Questarr a rencontré une erreur inattendue. Cliquez pour l’examiner et, si vous le souhaitez, envoyer un rapport de diagnostic pour aider à la corriger.",
    "O Questarr encontrou um erro inesperado. Clique para revisar e, se quiser, enviar um relatório de diagnóstico para ajudar a corrigi-lo.",
    "واجه Questarr خطأ غير متوقع. انقر للمراجعة وإرسال تقرير تشخيص اختياري للمساعدة في إصلاحه.",
    "Questarr에서 예기치 않은 오류가 발생했습니다. 클릭해 확인하고 문제 해결에 도움이 되는 진단 보고서를 보낼 수 있습니다.",
    "Questarr 遇到非預期錯誤。按一下即可檢查，並可選擇傳送診斷報告協助修正問題。",
    "Questarr gặp lỗi không mong muốn. Hãy nhấn để xem và tùy chọn gửi báo cáo chẩn đoán giúp khắc phục.",
    "Questarr mengalami kesalahan tak terduga. Klik untuk meninjau dan, jika mau, mengirim laporan diagnostik agar masalah dapat diperbaiki.",
  ],
  securityFlagged: [
    "{game} fue señalado y puesto en cuarentena. Motivo: {reason}.",
    "{game} 已被标记并隔离。原因：{reason}。",
    "{game} को चिह्नित करके क्वारंटीन किया गया। कारण: {reason}।",
    "{game} wurde markiert und unter Quarantäne gestellt. Grund: {reason}.",
    "{game} は検出され、隔離されました。理由: {reason}。",
    "{game} a été signalé et mis en quarantaine. Motif : {reason}.",
    "{game} foi sinalizado e colocado em quarentena. Motivo: {reason}.",
    "تم وضع {game} في العزل بعد الإبلاغ عنه. السبب: {reason}.",
    "{game}이(가) 탐지되어 격리되었습니다. 사유: {reason}.",
    "{game} 已遭標記並隔離。原因：{reason}。",
    "{game} bị đánh dấu và cách ly. Lý do: {reason}.",
    "{game} ditandai dan dikarantina. Alasan: {reason}.",
  ],
};
export interface LocalizedNotificationMessage {
  content: ReactNode;
  language: InterfaceLanguage;
  direction: "ltr" | "rtl" | "auto";
}
function formatTemplate(
  template: string,
  params: MessageParams,
  language: InterfaceLanguage
): ReactNode {
  return template.split(/(\{[a-z]+\})/g).map((part, index) => {
    const name = part.match(/^\{([a-z]+)\}$/)?.[1];
    if (!name || params[name] === undefined) return part;
    const isRawEnglish = name === "error" || name === "reason";
    return (
      <bdi key={`${name}-${index}`} {...(isRawEnglish ? { lang: "en" } : {})} dir="auto">
        {name === "count"
          ? new Intl.NumberFormat(language).format(Number(params[name]))
          : params[name]}
      </bdi>
    );
  });
}
function matchNotification(
  title: string,
  message: string
):
  | {
      key: MessageKey;
      params: MessageParams;
    }
  | undefined {
  let match: RegExpMatchArray | null;
  if (title === "Game Released" && (match = message.match(/^(.*) has been released!$/)))
    return { key: "gameReleased", params: { game: match[1]! } };
  if (title === "Game Delayed" && (match = message.match(/^(.*) has been delayed to (.*)$/)))
    return { key: "gameDelayed", params: { game: match[1]!, date: match[2]! } };
  if (title === "Download Completed" && (match = message.match(/^Download finished for (.*)$/)))
    return { key: "downloadFinished", params: { game: match[1]! } };
  if (
    title === "Import needs attention" &&
    (match = message.match(
      /^"(.*)" finished downloading but the file path could not be resolved from the download client\. Check Settings → Path Mappings or trigger the import manually\.$/
    ))
  )
    return { key: "importRemotePath", params: { game: match[1]! } };
  if (
    title === "Import needs attention" &&
    (match = message.match(
      /^"(.*)" finished downloading but its local path could not be accessed\. Check Settings → Path Mappings or trigger the import manually\.$/
    ))
  )
    return { key: "importLocalPath", params: { game: match[1]! } };
  if (
    title === "Download Aborted" &&
    (match = message.match(/^Download aborted for "(.*)": ([\s\S]*)$/))
  )
    return { key: "downloadAborted", params: { game: match[1]!, error: match[2]! } };
  if (
    title === "Download Failed" &&
    (match = message.match(
      /^Download for "(.*)" disappeared from the download client before completing and has been marked as failed\. If it actually finished, you may need to import it manually\.$/
    ))
  )
    return { key: "downloadFailed", params: { game: match[1]! } };
  if (
    title === "Release Flagged for Review" &&
    (match = message.match(/^(.*): ([\s\S]*)\. Please review and choose\.$/))
  )
    return { key: "releaseReview", params: { game: match[1]!, reason: match[2]! } };
  if (
    title === "Download Started" &&
    (match = message.match(/^Started downloading (.*) via (Usenet|Torrent)$/))
  )
    return { key: "downloadStarted", params: { release: match[1]!, method: match[2]! } };
  if (title === "Game Available" && (match = message.match(/^(.*) is now available for download$/)))
    return { key: "gameAvailable", params: { game: match[1]! } };
  if (
    title === "Multiple Results Found" &&
    (match = message.match(/^(\d+) result\(s\) found for (.*)\. Please review and choose\.$/))
  )
    return { key: "multipleResults", params: { count: match[1]!, game: match[2]! } };
  if (
    title === "Game Updates Available" &&
    (match = message.match(/^(\d+) update\(s\) found for (.*)$/))
  )
    return { key: "updatesAvailable", params: { count: match[1]!, game: match[2]! } };
  if (
    title === "Game Packs Available" &&
    (match = message.match(/^(\d+) pack\/add-on result\(s\) found for (.*)$/))
  )
    return { key: "packsAvailable", params: { count: match[1]!, game: match[2]! } };
  if (
    title === "Available on xREL.to" &&
    (match = message.match(/^(.*) is listed on xREL\.to: ([\s\S]*)$/))
  )
    return { key: "xrelAvailable", params: { game: match[1]!, release: match[2]! } };
  if (
    title === "Steam Wishlist Synced" &&
    (match = message.match(/^Successfully added (\d+) games from your Steam Wishlist\.$/))
  )
    return { key: "steamSynced", params: { count: match[1]! } };
  if (
    title === "Import extraction failed" &&
    (match = message.match(
      /^"([\s\S]*)" was moved into your library, but extracting the archive failed: ([\s\S]*)\. The archive is left at ([\s\S]*) — extract or delete it manually to finish the import\.$/
    ))
  )
    return {
      key: "importExtractionFailed",
      params: { game: match[1]!, error: match[2]!, path: match[3]! },
    };
  if (
    title === "Auto-delete failed" &&
    (match = message.match(
      /^"([\s\S]*)" was imported successfully, but removing it from the download client failed: ([\s\S]*)\. Please remove it manually\.$/
    ))
  )
    return { key: "autoDeleteFailed", params: { game: match[1]!, error: match[2]! } };
  if (
    title === "Automated error report sent" &&
    (match = message.match(
      /^Questarr detected an error and automatically sent a diagnostic report\. Support code: ([\s\S]*)\.$/
    ))
  )
    return { key: "errorReportSent", params: { code: match[1]! } };
  if (
    title === "Automated error report failed" &&
    (match = message.match(
      /^Questarr detected an error but could not send the automatic diagnostic report \(([\s\S]*)\)\.$/
    ))
  )
    return { key: "errorReportFailed", params: { error: match[1]! } };
  if (
    title === "An error occurred" &&
    message ===
      "Questarr encountered an unexpected error. Click to review and optionally send a diagnostic report to help fix it."
  )
    return { key: "errorOccurred", params: {} };
  if (
    title.startsWith("Security Alert: Download Flagged by ") &&
    (match = message.match(/^"(.*)" was flagged and quarantined\. ([\s\S]*)$/))
  )
    return { key: "securityFlagged", params: { game: match[1]!, reason: match[2]! } };
  return undefined;
}
export function localizeNotificationMessage(
  title: string,
  message: string,
  language: InterfaceLanguage
): LocalizedNotificationMessage {
  if (language !== "en") {
    const match = matchNotification(title, message);
    if (match) {
      const template =
        MESSAGES[match.key][
          NOTIFICATION_LOCALES.indexOf(language as (typeof NOTIFICATION_LOCALES)[number])
        ];
      if (template) {
        return {
          content: formatTemplate(template, match.params, language),
          language,
          direction: getNotificationTextDirection(language),
        };
      }
    }
  }
  return { content: message, language: "en", direction: "auto" };
}
