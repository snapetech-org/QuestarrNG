import type { InterfaceLanguage } from "@/lib/interface-locale";

export const API_ERROR_DETAIL_LOCALE_ORDER: readonly InterfaceLanguage[] = [
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

type LocaleMessages = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

const IGDB_ERROR_LABELS = {
  "popular games": [
    "los juegos populares",
    "热门游戏",
    "लोकप्रिय गेम",
    "beliebte Spiele",
    "人気ゲーム",
    "les jeux populaires",
    "os jogos populares",
    "ألعاب شائعة",
    "인기 게임",
    "熱門遊戲",
    "trò chơi phổ biến",
    "game populer",
  ],
  "recent releases": [
    "los lanzamientos recientes",
    "近期发行",
    "हाल ही में जारी गेम",
    "kürzlich erschienene Spiele",
    "最近のリリース",
    "les sorties récentes",
    "os lançamentos recentes",
    "الإصدارات الحديثة",
    "최근 출시작",
    "近期發行",
    "bản phát hành gần đây",
    "rilis terbaru",
  ],
  "upcoming releases": [
    "los próximos lanzamientos",
    "即将推出的游戏",
    "आगामी गेम",
    "kommende Veröffentlichungen",
    "今後のリリース",
    "les prochaines sorties",
    "os próximos lançamentos",
    "الإصدارات القادمة",
    "출시 예정작",
    "即將推出的遊戲",
    "bản phát hành sắp tới",
    "rilis mendatang",
  ],
  genre: [
    "género",
    "类型",
    "शैली",
    "Genre",
    "ジャンル",
    "genre",
    "gênero",
    "النوع",
    "장르",
    "類型",
    "thể loại",
    "genre",
  ],
  platform: [
    "plataforma",
    "平台",
    "प्लेटफ़ॉर्म",
    "Plattform",
    "プラットフォーム",
    "plateforme",
    "plataforma",
    "المنصة",
    "플랫폼",
    "平台",
    "nền tảng",
    "platform",
  ],
} as const satisfies Record<string, LocaleMessages>;

export const API_ERROR_DETAIL_TEMPLATES = {
  "Failed to fetch {errorLabel}": [
    "No se pudieron cargar {errorLabel}",
    "无法获取{errorLabel}",
    "{errorLabel} प्राप्त नहीं किया जा सका",
    "{errorLabel} konnten nicht abgerufen werden",
    "{errorLabel}を取得できませんでした",
    "Impossible de récupérer {errorLabel}",
    "Não foi possível obter {errorLabel}",
    "تعذر جلب {errorLabel}",
    "가져오기에 실패했습니다: {errorLabel}",
    "無法取得{errorLabel}",
    "Không thể tải {errorLabel}",
    "Gagal mengambil {errorLabel}",
  ],
  "Invalid {paramName} parameter": [
    "El parámetro {paramName} no es válido",
    "参数 {paramName} 无效",
    "{paramName} पैरामीटर अमान्य है",
    "Der Parameter {paramName} ist ungültig",
    "パラメーター {paramName} が無効です",
    "Le paramètre {paramName} n’est pas valide",
    "O parâmetro {paramName} é inválido",
    "المعامل {paramName} غير صالح",
    "{paramName} 매개변수가 유효하지 않습니다",
    "參數 {paramName} 無效",
    "Tham số {paramName} không hợp lệ",
    "Parameter {paramName} tidak valid",
  ],
  "Failed to fetch games by {errorLabel}": [
    "No se pudieron cargar juegos para {errorLabel}",
    "无法按{errorLabel}获取游戏",
    "{errorLabel} के अनुसार गेम प्राप्त नहीं किए जा सके",
    "Spiele nach {errorLabel} konnten nicht abgerufen werden",
    "{errorLabel}別のゲームを取得できませんでした",
    "Impossible de récupérer les jeux par {errorLabel}",
    "Não foi possível obter jogos por {errorLabel}",
    "تعذر جلب الألعاب حسب {errorLabel}",
    "{errorLabel} 기준 게임을 가져오지 못했습니다",
    "無法依{errorLabel}取得遊戲",
    "Không thể tải trò chơi theo {errorLabel}",
    "Gagal mengambil game berdasarkan {errorLabel}",
  ],
  "Invalid SSL configuration: {error}": [
    "Configuración SSL no válida: {error}",
    "SSL 配置无效：{error}",
    "SSL कॉन्फ़िगरेशन अमान्य है: {error}",
    "Ungültige SSL-Konfiguration: {error}",
    "SSL 設定が無効です: {error}",
    "Configuration SSL invalide : {error}",
    "Configuração de SSL inválida: {error}",
    "إعدادات SSL غير صالحة: {error}",
    "SSL 구성이 올바르지 않습니다: {error}",
    "SSL 設定無效：{error}",
    "Cấu hình SSL không hợp lệ: {error}",
    "Konfigurasi SSL tidak valid: {error}",
  ],
  "Uploaded certificate/key are invalid: {error}": [
    "El certificado o la clave cargados no son válidos: {error}",
    "上传的证书或密钥无效：{error}",
    "अपलोड किया गया प्रमाणपत्र या कुंजी अमान्य है: {error}",
    "Das hochgeladene Zertifikat oder der Schlüssel ist ungültig: {error}",
    "アップロードされた証明書または鍵が無効です: {error}",
    "Le certificat ou la clé envoyé n’est pas valide : {error}",
    "O certificado ou a chave enviados são inválidos: {error}",
    "الشهادة أو المفتاح المرفوع غير صالح: {error}",
    "업로드한 인증서 또는 키가 유효하지 않습니다: {error}",
    "上傳的憑證或金鑰無效：{error}",
    "Chứng chỉ hoặc khóa đã tải lên không hợp lệ: {error}",
    "Sertifikat atau kunci yang diunggah tidak valid: {error}",
  ],
  "Twitch returned an unexpected error (status {status}).": [
    "Twitch devolvió un error inesperado (estado {status}).",
    "Twitch 返回了意外错误（状态码 {status}）。",
    "Twitch ने अनपेक्षित त्रुटि लौटाई (स्थिति {status})।",
    "Twitch hat einen unerwarteten Fehler zurückgegeben (Status {status}).",
    "Twitch が予期しないエラーを返しました（ステータス {status}）。",
    "Twitch a renvoyé une erreur inattendue (statut {status}).",
    "O Twitch retornou um erro inesperado (status {status}).",
    "أعاد Twitch خطأ غير متوقع (الحالة {status}).",
    "Twitch에서 예상하지 못한 오류를 반환했습니다(상태 {status}).",
    "Twitch 傳回了非預期錯誤（狀態 {status}）。",
    "Twitch trả về lỗi ngoài dự kiến (trạng thái {status}).",
    "Twitch mengembalikan kesalahan tak terduga (status {status}).",
  ],
  "IGDB rejected the request (status {status}).": [
    "IGDB rechazó la solicitud (estado {status}).",
    "IGDB 拒绝了请求（状态码 {status}）。",
    "IGDB ने अनुरोध अस्वीकार कर दिया (स्थिति {status})।",
    "IGDB hat die Anfrage abgelehnt (Status {status}).",
    "IGDB がリクエストを拒否しました（ステータス {status}）。",
    "IGDB a refusé la requête (statut {status}).",
    "O IGDB rejeitou a solicitação (status {status}).",
    "رفض IGDB الطلب (الحالة {status}).",
    "IGDB에서 요청을 거부했습니다(상태 {status}).",
    "IGDB 拒絕了要求（狀態 {status}）。",
    "IGDB từ chối yêu cầu (trạng thái {status}).",
    "IGDB menolak permintaan (status {status}).",
  ],
  "IGDB API error: {status}": [
    "Error de la API de IGDB: {status}",
    "IGDB API 错误：{status}",
    "IGDB API त्रुटि: {status}",
    "IGDB-API-Fehler: {status}",
    "IGDB API エラー: {status}",
    "Erreur de l’API IGDB : {status}",
    "Erro na API do IGDB: {status}",
    "خطأ في واجهة IGDB: {status}",
    "IGDB API 오류: {status}",
    "IGDB API 錯誤：{status}",
    "Lỗi API IGDB: {status}",
    "Kesalahan API IGDB: {status}",
  ],
  "Server responded with {status}: {detail}": [
    "El servidor respondió con {status}: {detail}",
    "服务器返回了 {status}：{detail}",
    "सर्वर ने {status} के साथ जवाब दिया: {detail}",
    "Der Server antwortete mit {status}: {detail}",
    "サーバーの応答 {status}: {detail}",
    "Le serveur a répondu avec {status} : {detail}",
    "O servidor respondeu com {status}: {detail}",
    "استجاب الخادم بالرمز {status}: {detail}",
    "서버 응답 {status}: {detail}",
    "伺服器回應 {status}：{detail}",
    "Máy chủ phản hồi với {status}: {detail}",
    "Server merespons dengan {status}: {detail}",
  ],
  "Prowlarr management API returned HTTP {status}.": [
    "La API de administración de Prowlarr devolvió HTTP {status}.",
    "Prowlarr 管理 API 返回了 HTTP {status}。",
    "Prowlarr प्रबंधन API ने HTTP {status} लौटाया।",
    "Die Prowlarr-Verwaltungs-API gab HTTP {status} zurück.",
    "Prowlarr 管理 API が HTTP {status} を返しました。",
    "L’API de gestion Prowlarr a renvoyé HTTP {status}.",
    "A API de gerenciamento do Prowlarr retornou HTTP {status}.",
    "أعادت واجهة إدارة Prowlarr استجابة HTTP {status}.",
    "Prowlarr 관리 API가 HTTP {status}을 반환했습니다.",
    "Prowlarr 管理 API 傳回 HTTP {status}。",
    "API quản lý Prowlarr trả về HTTP {status}.",
    "API pengelolaan Prowlarr mengembalikan HTTP {status}.",
  ],
  "Prowlarr indexer inventory returned HTTP {status}.": [
    "La lista de indexadores de Prowlarr devolvió HTTP {status}.",
    "Prowlarr 索引器清单返回了 HTTP {status}。",
    "Prowlarr इंडेक्सर सूची ने HTTP {status} लौटाया।",
    "Die Prowlarr-Indexer-Liste gab HTTP {status} zurück.",
    "Prowlarr のインデクサー一覧が HTTP {status} を返しました。",
    "L’inventaire des indexeurs Prowlarr a renvoyé HTTP {status}.",
    "A lista de indexadores do Prowlarr retornou HTTP {status}.",
    "أعادت قائمة فهارس Prowlarr استجابة HTTP {status}.",
    "Prowlarr 인덱서 목록이 HTTP {status}을 반환했습니다.",
    "Prowlarr 索引器清單傳回 HTTP {status}。",
    "Danh sách indexer Prowlarr trả về HTTP {status}.",
    "Daftar indexer Prowlarr mengembalikan HTTP {status}.",
  ],
  "Prowlarr management API failed after HTTP {status}.": [
    "La API de administración de Prowlarr falló tras HTTP {status}.",
    "Prowlarr 管理 API 在 HTTP {status} 后失败。",
    "HTTP {status} के बाद Prowlarr प्रबंधन API विफल हो गई।",
    "Die Prowlarr-Verwaltungs-API schlug nach HTTP {status} fehl.",
    "HTTP {status} の後、Prowlarr 管理 API に失敗しました。",
    "L’API de gestion Prowlarr a échoué après HTTP {status}.",
    "A API de gerenciamento do Prowlarr falhou após HTTP {status}.",
    "فشلت واجهة إدارة Prowlarr بعد استجابة HTTP {status}.",
    "HTTP {status} 응답 이후 Prowlarr 관리 API가 실패했습니다.",
    "Prowlarr 管理 API 在 HTTP {status} 後失敗。",
    "API quản lý Prowlarr gặp lỗi sau HTTP {status}.",
    "API pengelolaan Prowlarr gagal setelah HTTP {status}.",
  ],
  "Prowlarr feed returned HTTP {status}.": [
    "El feed de Prowlarr devolvió HTTP {status}.",
    "Prowlarr feed 返回了 HTTP {status}。",
    "Prowlarr फ़ीड ने HTTP {status} लौटाया।",
    "Der Prowlarr-Feed gab HTTP {status} zurück.",
    "Prowlarr フィードが HTTP {status} を返しました。",
    "Le flux Prowlarr a renvoyé HTTP {status}.",
    "O feed do Prowlarr retornou HTTP {status}.",
    "أعاد موجز Prowlarr استجابة HTTP {status}.",
    "Prowlarr 피드가 HTTP {status}을 반환했습니다.",
    "Prowlarr feed 傳回 HTTP {status}。",
    "Feed Prowlarr trả về HTTP {status}.",
    "Feed Prowlarr mengembalikan HTTP {status}.",
  ],
  "Download {downloadId} not found": [
    "No se encontró la descarga {downloadId}",
    "找不到下载项 {downloadId}",
    "डाउनलोड {downloadId} नहीं मिला",
    "Download {downloadId} wurde nicht gefunden",
    "ダウンロード {downloadId} が見つかりません",
    "Téléchargement {downloadId} introuvable",
    "O download {downloadId} não foi encontrado",
    "تعذر العثور على التنزيل {downloadId}",
    "다운로드 ID {downloadId}에 해당하는 항목을 찾을 수 없습니다",
    "找不到下載項目 {downloadId}",
    "Không tìm thấy lượt tải {downloadId}",
    "Unduhan {downloadId} tidak ditemukan",
  ],
  "Game not found for download {downloadId}": [
    "No se encontró el juego de la descarga {downloadId}",
    "找不到下载项 {downloadId} 对应的游戏",
    "डाउनलोड {downloadId} के लिए गेम नहीं मिला",
    "Für Download {downloadId} wurde kein Spiel gefunden",
    "ダウンロード {downloadId} に対応するゲームが見つかりません",
    "Aucun jeu trouvé pour le téléchargement {downloadId}",
    "Nenhum jogo foi encontrado para o download {downloadId}",
    "لم يتم العثور على لعبة للتنزيل {downloadId}",
    "다운로드 {downloadId}에 해당하는 게임을 찾을 수 없습니다",
    "找不到下載項目 {downloadId} 對應的遊戲",
    "Không tìm thấy trò chơi cho lượt tải {downloadId}",
    "Game untuk unduhan {downloadId} tidak ditemukan",
  ],
  "Source path not found: {path}": [
    "No se encontró la ruta de origen: {path}",
    "找不到源路径：{path}",
    "स्रोत पथ नहीं मिला: {path}",
    "Quellpfad nicht gefunden: {path}",
    "ソースパスが見つかりません: {path}",
    "Chemin source introuvable : {path}",
    "Caminho de origem não encontrado: {path}",
    "لم يتم العثور على مسار المصدر: {path}",
    "원본 경로를 찾을 수 없습니다: {path}",
    "找不到來源路徑：{path}",
    "Không tìm thấy đường dẫn nguồn: {path}",
    "Jalur sumber tidak ditemukan: {path}",
  ],
  "RomM destination already exists: {destination}": [
    "El destino de RomM ya existe: {destination}",
    "RomM 目标位置已存在：{destination}",
    "RomM गंतव्य पहले से मौजूद है: {destination}",
    "Das RomM-Ziel ist bereits vorhanden: {destination}",
    "RomM の保存先はすでに存在します: {destination}",
    "La destination RomM existe déjà : {destination}",
    "O destino do RomM já existe: {destination}",
    "وجهة RomM موجودة بالفعل: {destination}",
    "RomM 대상이 이미 있습니다: {destination}",
    "RomM 目的地已存在：{destination}",
    "Đích RomM đã tồn tại: {destination}",
    "Tujuan RomM sudah ada: {destination}",
  ],
  "Could not find a free RomM destination for {destination}": [
    "No se encontró un destino de RomM libre para {destination}",
    "找不到用于 {destination} 的空闲 RomM 目标位置",
    "{destination} के लिए खाली RomM गंतव्य नहीं मिला",
    "Für {destination} wurde kein freies RomM-Ziel gefunden",
    "{destination} に使える空き RomM 保存先が見つかりません",
    "Aucune destination RomM libre trouvée pour {destination}",
    "Não foi encontrado um destino RomM livre para {destination}",
    "تعذّر العثور على وجهة RomM متاحة لـ {destination}",
    "{destination}에 사용할 수 있는 RomM 대상이 없습니다",
    "找不到可供 {destination} 使用的空閒 RomM 目的地",
    "Không tìm thấy đích RomM trống cho {destination}",
    "Tidak ditemukan tujuan RomM yang tersedia untuk {destination}",
  ],
  "Archive contains too many entries (limit: {limit}).": [
    "El archivo comprimido contiene demasiadas entradas (límite: {limit}).",
    "压缩包中的条目过多（上限：{limit}）。",
    "आर्काइव में बहुत अधिक प्रविष्टियाँ हैं (सीमा: {limit})।",
    "Das Archiv enthält zu viele Einträge (Grenzwert: {limit}).",
    "アーカイブ内の項目が多すぎます（上限: {limit}）。",
    "L’archive contient trop d’entrées (limite : {limit}).",
    "O arquivo compactado contém entradas demais (limite: {limit}).",
    "يحتوي الأرشيف على عدد كبير جدًا من العناصر (الحد: {limit}).",
    "압축 파일에 항목이 너무 많습니다(한도: {limit}).",
    "封存檔中的項目過多（上限：{limit}）。",
    "Kho lưu trữ có quá nhiều mục (giới hạn: {limit}).",
    "Arsip berisi terlalu banyak entri (batas: {limit}).",
  ],
  "Archive expands beyond the configured size limit ({bytes} bytes).": [
    "El tamaño descomprimido del archivo supera el límite configurado ({bytes} bytes).",
    "压缩包解压后的大小超过配置上限（{bytes} 字节）。",
    "आर्काइव निकालने के बाद उसका आकार निर्धारित सीमा ({bytes} बाइट) से अधिक है।",
    "Die entpackte Größe des Archivs überschreitet den konfigurierten Grenzwert ({bytes} Bytes).",
    "アーカイブの展開サイズが設定上限（{bytes} バイト）を超えています。",
    "La taille décompressée de l’archive dépasse la limite configurée ({bytes} octets).",
    "O tamanho descompactado do arquivo excede o limite configurado ({bytes} bytes).",
    "يتجاوز حجم الأرشيف بعد فك ضغطه الحدّ المُعدّ ({bytes} بايت).",
    "압축 해제 후 아카이브 크기가 설정된 크기 제한({bytes}바이트)을 초과합니다.",
    "封存檔解壓縮後的大小超過設定上限（{bytes} 位元組）。",
    "Dung lượng kho lưu trữ sau khi giải nén vượt quá giới hạn đã cấu hình ({bytes} byte).",
    "Ukuran arsip setelah diekstrak melampaui batas yang dikonfigurasi ({bytes} byte).",
  ],
  "Security alert: {detail}": [
    "Alerta de seguridad: {detail}",
    "安全警报：{detail}",
    "सुरक्षा चेतावनी: {detail}",
    "Sicherheitswarnung: {detail}",
    "セキュリティ警告: {detail}",
    "Alerte de sécurité : {detail}",
    "Alerta de segurança: {detail}",
    "تنبيه أمني: {detail}",
    "보안 경고: {detail}",
    "安全警示：{detail}",
    "Cảnh báo bảo mật: {detail}",
    "Peringatan keamanan: {detail}",
  ],
  "Password required: {detail}": [
    "Se necesita una contraseña: {detail}",
    "需要密码：{detail}",
    "पासवर्ड आवश्यक है: {detail}",
    "Passwort erforderlich: {detail}",
    "パスワードが必要です: {detail}",
    "Mot de passe requis : {detail}",
    "Senha necessária: {detail}",
    "كلمة المرور مطلوبة: {detail}",
    "암호가 필요합니다: {detail}",
    "需要密碼：{detail}",
    "Cần mật khẩu: {detail}",
    "Kata sandi diperlukan: {detail}",
  ],
  "Import failed: {detail}": [
    "Error al importar: {detail}",
    "导入失败：{detail}",
    "आयात विफल: {detail}",
    "Import fehlgeschlagen: {detail}",
    "インポートに失敗しました: {detail}",
    "Échec de l’importation : {detail}",
    "Falha na importação: {detail}",
    "فشل الاستيراد: {detail}",
    "가져오기 실패: {detail}",
    "匯入失敗：{detail}",
    "Nhập không thành công: {detail}",
    "Impor gagal: {detail}",
  ],
  "VirusTotal detected {positives} engine(s) flagging this file (threshold: {threshold})": [
    "VirusTotal detectó que {positives} motores marcaron este archivo (umbral: {threshold})",
    "VirusTotal 检测到 {positives} 个引擎将此文件标记为风险项（阈值：{threshold}）",
    "VirusTotal ने इस फ़ाइल को {positives} इंजन द्वारा चिह्नित पाया (सीमा: {threshold})",
    "VirusTotal hat festgestellt, dass {positives} Engines diese Datei markieren (Schwellenwert: {threshold})",
    "VirusTotal により {positives} 個のエンジンがこのファイルを検出しました（しきい値: {threshold}）",
    "VirusTotal a détecté que {positives} moteurs signalent ce fichier (seuil : {threshold})",
    "O VirusTotal detectou que {positives} mecanismos sinalizaram este arquivo (limite: {threshold})",
    "اكتشف VirusTotal أن {positives} محركًا وضع علامة على هذا الملف (العتبة: {threshold})",
    "VirusTotal에서 엔진 {positives}개가 이 파일을 표시했습니다(임계값: {threshold})",
    "VirusTotal 偵測到 {positives} 個引擎標記此檔案（閾值：{threshold}）",
    "VirusTotal phát hiện {positives} công cụ đánh dấu tệp này (ngưỡng: {threshold})",
    "VirusTotal mendeteksi {positives} mesin menandai file ini (ambang: {threshold})",
  ],
  "ClamAV detected {signature} in {filename}": [
    "ClamAV detectó {signature} en {filename}",
    "ClamAV 在 {filename} 中检测到 {signature}",
    "ClamAV ने {filename} में {signature} का पता लगाया",
    "ClamAV hat {signature} in {filename} erkannt",
    "ClamAV が {filename} 内で {signature} を検出しました",
    "ClamAV a détecté {signature} dans {filename}",
    "O ClamAV detectou {signature} em {filename}",
    "اكتشف ClamAV التوقيع {signature} في {filename}",
    "ClamAV에서 {filename}의 {signature}을(를) 탐지했습니다",
    "ClamAV 在 {filename} 中偵測到 {signature}",
    "ClamAV phát hiện {signature} trong {filename}",
    "ClamAV mendeteksi {signature} di {filename}",
  ],
  "{detail} (the archive is corrupt or incomplete — re-download the release, extraction cannot recover this file)":
    [
      "{detail} (el archivo comprimido está dañado o incompleto; vuelve a descargar el lanzamiento, la extracción no puede recuperar este archivo)",
      "{detail}（压缩包已损坏或不完整，请重新下载该版本；无法通过解压恢复此文件）",
      "{detail} (आर्काइव खराब या अधूरा है — रिलीज़ फिर से डाउनलोड करें; निष्कर्षण इस फ़ाइल को पुनर्प्राप्त नहीं कर सकता)",
      "{detail} (das Archiv ist beschädigt oder unvollständig. Lade die Veröffentlichung erneut herunter; die Extraktion kann diese Datei nicht wiederherstellen)",
      "{detail}（アーカイブが破損または不完全です。リリースを再ダウンロードしてください。このファイルは展開しても復元できません）",
      "{detail} (l’archive est corrompue ou incomplète — retéléchargez la version, l’extraction ne peut pas récupérer ce fichier)",
      "{detail} (o arquivo compactado está corrompido ou incompleto — baixe a versão novamente; a extração não pode recuperar este arquivo)",
      "{detail} (الأرشيف تالف أو غير مكتمل — أعد تنزيل الإصدار، إذ لا يمكن للاستخراج استعادة هذا الملف)",
      "{detail} (압축 파일이 손상되었거나 불완전합니다. 배포 파일을 다시 다운로드하세요. 압축 해제로는 이 파일을 복구할 수 없습니다)",
      "{detail}（封存檔已損毀或不完整，請重新下載該版本；解壓縮無法復原此檔案）",
      "{detail} (kho lưu trữ bị hỏng hoặc chưa đầy đủ — hãy tải lại bản phát hành; không thể khôi phục tệp này bằng cách giải nén)",
      "{detail} (arsip rusak atau tidak lengkap — unduh ulang rilis ini; ekstraksi tidak dapat memulihkan file ini)",
    ],
  "You can have at most {count} API keys. Revoke one first.": [
    "Puedes tener como máximo {count} claves de API. Revoca una primero.",
    "最多只能有 {count} 个 API 密钥。请先撤销一个。",
    "आपके पास अधिकतम {count} API कुंजियाँ हो सकती हैं। पहले एक को रद्द करें।",
    "Du kannst höchstens {count} API-Schlüssel haben. Widerrufe zuerst einen.",
    "API キーは最大 {count} 個までです。先に 1 つを取り消してください。",
    "Vous pouvez avoir au maximum {count} clés API. Révoquez-en une d’abord.",
    "Você pode ter no máximo {count} chaves de API. Revogue uma primeiro.",
    "يمكنك امتلاك {count} من مفاتيح API كحد أقصى. ألغِ أحدها أولًا.",
    "API 키는 최대 {count}개까지 사용할 수 있습니다. 먼저 하나를 폐기하세요.",
    "最多只能有 {count} 個 API 金鑰。請先撤銷一個。",
    "Bạn có thể có tối đa {count} khóa API. Hãy thu hồi một khóa trước.",
    "Anda dapat memiliki paling banyak {count} kunci API. Cabut satu terlebih dahulu.",
  ],
  "The provided domain is not in the allowed list: {domains}": [
    "El dominio indicado no está en la lista de permitidos: {domains}",
    "提供的域名不在允许列表中：{domains}",
    "दिया गया डोमेन अनुमत सूची में नहीं है: {domains}",
    "Die angegebene Domain steht nicht auf der Zulassungsliste: {domains}",
    "指定されたドメインは許可リストにありません: {domains}",
    "Le domaine fourni ne figure pas dans la liste des domaines autorisés : {domains}",
    "O domínio informado não está na lista de permitidos: {domains}",
    "النطاق المُدخل غير موجود في قائمة النطاقات المسموح بها: {domains}",
    "입력한 도메인이 허용 목록에 없습니다: {domains}",
    "提供的網域不在允許清單中：{domains}",
    "Tên miền được cung cấp không nằm trong danh sách cho phép: {domains}",
    "Domain yang diberikan tidak ada dalam daftar yang diizinkan: {domains}",
  ],
} as const satisfies Record<string, LocaleMessages>;

type TemplateKey = keyof typeof API_ERROR_DETAIL_TEMPLATES;

function localizeIgdbErrorLabel(value: string, language: InterfaceLanguage): string | undefined {
  const labels = IGDB_ERROR_LABELS[value as keyof typeof IGDB_ERROR_LABELS];
  const index = API_ERROR_DETAIL_LOCALE_ORDER.indexOf(language);
  return labels?.[index];
}

function formatTemplate(
  key: TemplateKey,
  values: Record<string, string>,
  language: InterfaceLanguage
): string {
  const index = API_ERROR_DETAIL_LOCALE_ORDER.indexOf(language);
  const template = API_ERROR_DETAIL_TEMPLATES[key][index];
  if (!template) return key;

  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) return placeholder;
    return language === "ar" ? `\u2068${value}\u2069` : value;
  });
}

/** Localizes app-owned dynamic API error templates while preserving their values. */
export function localizeApiErrorDetailTemplate(
  detail: string,
  language: InterfaceLanguage
): string | undefined {
  const gamesByMatch = detail.match(/^Failed to fetch games by (.+)$/);
  const gamesByLabel = gamesByMatch?.[1]
    ? localizeIgdbErrorLabel(gamesByMatch[1], language)
    : undefined;
  if (gamesByLabel) {
    return formatTemplate(
      "Failed to fetch games by {errorLabel}",
      { errorLabel: gamesByLabel },
      language
    );
  }

  const invalidParameterMatch = detail.match(/^Invalid (.+) parameter$/);
  const invalidParameterLabel = invalidParameterMatch?.[1]
    ? localizeIgdbErrorLabel(invalidParameterMatch[1], language)
    : undefined;
  if (invalidParameterLabel) {
    return formatTemplate(
      "Invalid {paramName} parameter",
      { paramName: invalidParameterLabel },
      language
    );
  }

  const failedFetchMatch = detail.match(/^Failed to fetch (.+)$/);
  const failedFetchLabel = failedFetchMatch?.[1]
    ? localizeIgdbErrorLabel(failedFetchMatch[1], language)
    : undefined;
  if (failedFetchLabel) {
    return formatTemplate(
      "Failed to fetch {errorLabel}",
      { errorLabel: failedFetchLabel },
      language
    );
  }

  const sslMatch = detail.match(/^Invalid SSL configuration: (.+)$/);
  if (sslMatch?.[1]) {
    return formatTemplate("Invalid SSL configuration: {error}", { error: sslMatch[1] }, language);
  }

  const uploadedCertMatch = detail.match(/^Uploaded certificate\/key are invalid: (.+)$/);
  if (uploadedCertMatch?.[1]) {
    return formatTemplate(
      "Uploaded certificate/key are invalid: {error}",
      {
        error: uploadedCertMatch[1],
      },
      language
    );
  }

  const statusPatterns: Array<[RegExp, TemplateKey, string[]]> = [
    [
      /^Twitch returned an unexpected error \(status (\d+)\)\.$/,
      "Twitch returned an unexpected error (status {status}).",
      ["status"],
    ],
    [
      /^IGDB rejected the request \(status (\d+)\)\.$/,
      "IGDB rejected the request (status {status}).",
      ["status"],
    ],
    [/^IGDB API error: (\d+)$/, "IGDB API error: {status}", ["status"]],
    [
      /^Server responded with (\d+): (.+)$/,
      "Server responded with {status}: {detail}",
      ["status", "detail"],
    ],
    [
      /^Prowlarr management API returned HTTP (\d+)\.$/,
      "Prowlarr management API returned HTTP {status}.",
      ["status"],
    ],
    [
      /^Prowlarr indexer inventory returned HTTP (\d+)\.$/,
      "Prowlarr indexer inventory returned HTTP {status}.",
      ["status"],
    ],
    [
      /^Prowlarr management API failed after HTTP (\d+)\.$/,
      "Prowlarr management API failed after HTTP {status}.",
      ["status"],
    ],
    [/^Prowlarr feed returned HTTP (\d+)\.$/, "Prowlarr feed returned HTTP {status}.", ["status"]],
    [/^Download (.+) not found$/, "Download {downloadId} not found", ["downloadId"]],
    [
      /^Game not found for download (.+)$/,
      "Game not found for download {downloadId}",
      ["downloadId"],
    ],
    [/^Source path not found: (.+)$/, "Source path not found: {path}", ["path"]],
    [
      /^RomM destination already exists: (.+)$/,
      "RomM destination already exists: {destination}",
      ["destination"],
    ],
    [
      /^Could not find a free RomM destination for (.+)$/,
      "Could not find a free RomM destination for {destination}",
      ["destination"],
    ],
    [
      /^Archive contains too many entries \(limit: (\d+)\)\.$/,
      "Archive contains too many entries (limit: {limit}).",
      ["limit"],
    ],
    [
      /^Archive expands beyond the configured size limit \((\d+) bytes\)\.$/,
      "Archive expands beyond the configured size limit ({bytes} bytes).",
      ["bytes"],
    ],
    [
      /^VirusTotal detected (\d+) engine\(s\) flagging this file \(threshold: (\d+)\)$/,
      "VirusTotal detected {positives} engine(s) flagging this file (threshold: {threshold})",
      ["positives", "threshold"],
    ],
    [
      /^ClamAV detected (.+) in (.+)$/,
      "ClamAV detected {signature} in {filename}",
      ["signature", "filename"],
    ],
    [
      /^The provided domain is not in the allowed list: (.+)$/,
      "The provided domain is not in the allowed list: {domains}",
      ["domains"],
    ],
  ];
  for (const [pattern, template, names] of statusPatterns) {
    const match = detail.match(pattern);
    if (match) {
      const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]!]));
      return formatTemplate(template, values, language);
    }
  }

  const wrappedMessage = detail.match(/^(Security alert|Password required|Import failed): (.+)$/);
  if (wrappedMessage?.[1] && wrappedMessage[2]) {
    const template = (wrappedMessage[1] + ": {detail}") as TemplateKey;
    return formatTemplate(template, { detail: wrappedMessage[2] }, language);
  }

  const archiveFailureSuffix =
    " (the archive is corrupt or incomplete — re-download the release, extraction cannot recover this file)";
  if (detail.endsWith(archiveFailureSuffix)) {
    return formatTemplate(
      "{detail} (the archive is corrupt or incomplete — re-download the release, extraction cannot recover this file)",
      { detail: detail.slice(0, -archiveFailureSuffix.length) },
      language
    );
  }

  const apiKeyLimitMatch = detail.match(
    /^You can have at most (\d+) API keys\. Revoke one first\.$/
  );
  if (apiKeyLimitMatch) {
    return formatTemplate(
      "You can have at most {count} API keys. Revoke one first.",
      { count: new Intl.NumberFormat(language).format(Number(apiKeyLimitMatch[1])) },
      language
    );
  }

  return undefined;
}

export const API_ERROR_DETAIL_TEMPLATE_KEYS = Object.keys(
  API_ERROR_DETAIL_TEMPLATES
) as TemplateKey[];
