import { createContext, useContext, useEffect, useRef, useState } from "react";

/* ---------- API ---------- */

export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/* ---------- Types ---------- */

export type NoteItem = {
  id: string;
  title: string;
  excerpt?: string;
  content?: string;
  tags: string;
  pinned: number;
  updated_at: string;
};
export type Project = { id: string; name: string; color: string };
export type Status = "todo" | "doing" | "done";
export type Task = {
  id: string;
  project_id: string | null;
  title: string;
  note: string;
  status: Status;
  due: string | null;
  position: number;
};
export type FlowItem = { id: string; title: string; updated_at: string; data?: string };

/* ---------- Site settings ---------- */

export type Settings = {
  site_name: string;
  owner_name: string;
  default_lang: Lang;
  /** set when the owner uploaded their own logo */
  logo_updated: string | null;
  version: string;
};
export const DEFAULT_SETTINGS: Settings = {
  site_name: "PhongLab",
  owner_name: "",
  default_lang: "en",
  logo_updated: null,
  version: "",
};
export const SettingsCtx = createContext<{ settings: Settings; reload: () => void }>({
  settings: DEFAULT_SETTINGS,
  reload: () => {},
});
export const useSettings = () => useContext(SettingsCtx);

/* ---------- i18n ---------- */

export const LANGS = ["vi", "ja", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
/** BCP 47 locale for dates and numbers */
export const locale = (lang: Lang) => (lang === "vi" ? "vi-VN" : lang === "ja" ? "ja-JP" : "en-US");

// [Tiếng Việt, 日本語, English]
const dict = {
  home: ["Trang chủ", "ホーム", "Home"],
  notes: ["Ghi chú", "ノート", "Notes"],
  tasks: ["Todo", "ToDo リスト", "To-do"],
  gantt: ["Tiến độ", "工程表", "Schedule"],
  task: ["Công việc", "タスク", "Task"],
  newItem: ["Thêm việc", "新規作成", "Add task"],
  newTask: ["Việc mới", "新しいタスク", "New task"],
  addChild: ["Thêm việc con", "子タスクを追加", "Add subtask"],
  showInfo: ["Hiện thông tin", "タスク情報を表示", "Show details"],
  day: ["Ngày", "日", "Day"],
  week: ["Tuần", "週", "Week"],
  month: ["Tháng", "月", "Month"],
  start: ["Bắt đầu", "開始", "Start"],
  end: ["Kết thúc", "終了", "End"],
  progress: ["Tiến độ", "進捗", "Progress"],
  assignee: ["Phụ trách", "担当", "Assignee"],
  dependsOn: ["Làm sau việc", "先行タスク", "Depends on"],
  parent: ["Thuộc nhóm", "親タスク", "Parent"],
  groupHint: [
    "Nhóm: ngày và % được tính tự động từ các việc con.",
    "グループ：日付と進捗は子タスクから自動計算されます。",
    "Group: dates and progress are calculated from its subtasks.",
  ],
  flow: ["Sơ đồ", "フロー図", "Diagrams"],
  quickPlaceholder: ["Ghi nhanh vào Inbox", "Inbox にメモ", "Note to Inbox"],
  savedInbox: ["Đã lưu vào Inbox", "Inbox に保存しました", "Saved to Inbox"],
  todo: ["Cần làm", "未着手", "To do"],
  doing: ["Đang làm", "進行中", "In progress"],
  done: ["Hoàn thành", "完了", "Done"],
  openTasks: ["Việc đang mở", "未完了タスク", "Open tasks"],
  recentNotes: ["Ghi chú gần đây", "最近のノート", "Recent notes"],
  recentFlows: ["Sơ đồ gần đây", "最近のフロー図", "Recent diagrams"],
  empty: ["Chưa có gì ở đây", "まだ何もありません", "Nothing here yet"],
  seeAll: ["Xem tất cả", "すべて表示", "See all"],
  search: ["Tìm kiếm", "検索", "Search"],
  newNote: ["Ghi chú mới", "新規ノート", "New note"],
  untitled: ["Chưa đặt tên", "無題", "Untitled"],
  title: ["Tiêu đề", "タイトル", "Title"],
  tagsPlaceholder: ["Thẻ, cách nhau bằng dấu phẩy", "タグ（カンマ区切り）", "Tags, comma separated"],
  writePlaceholder: ["Viết bằng Markdown…", "Markdown で書く…", "Write in Markdown…"],
  edit: ["Soạn", "編集", "Edit"],
  preview: ["Xem", "プレビュー", "Preview"],
  pin: ["Ghim", "ピン留め", "Pin"],
  unpin: ["Bỏ ghim", "ピン解除", "Unpin"],
  del: ["Xóa", "削除", "Delete"],
  confirmDelete: ["Xóa mục này? Không thể hoàn tác.", "削除しますか？元に戻せません。", "Delete this? This cannot be undone."],
  saving: ["Đang lưu…", "保存中…", "Saving…"],
  saved: ["Đã lưu", "保存済み", "Saved"],
  saveError: ["Lỗi lưu", "保存エラー", "Save failed"],
  selectNote: ["Chọn một mục hoặc tạo mới", "選択するか、新規作成してください", "Pick one or create a new one"],
  allProjects: ["Tất cả", "すべて", "All"],
  noProject: ["Không dự án", "プロジェクトなし", "No project"],
  newProject: ["+ Dự án", "+ プロジェクト", "+ Project"],
  projectName: ["Tên dự án", "プロジェクト名", "Project name"],
  deleteProject: [
    "Xóa dự án này? Các việc bên trong vẫn được giữ.",
    "このプロジェクトを削除しますか？タスクは残ります。",
    "Delete this project? Its tasks are kept.",
  ],
  addTask: ["+ Thêm việc", "+ タスクを追加", "+ Add task"],
  due: ["Hạn", "期限", "Due"],
  project: ["Dự án", "プロジェクト", "Project"],
  detail: ["Chi tiết", "詳細", "Details"],
  close: ["Đóng", "閉じる", "Close"],
  overdue: ["Quá hạn", "期限切れ", "Overdue"],
  today: ["Hôm nay", "今日", "Today"],
  newFlow: ["Sơ đồ mới", "新規フロー図", "New diagram"],
  selectFlow: ["Chọn một sơ đồ hoặc tạo mới", "フロー図を選択するか、新規作成してください", "Pick a diagram or create a new one"],
  loading: ["Đang tải…", "読み込み中…", "Loading…"],
  theme: ["Giao diện sáng/tối", "ライト/ダーク切替", "Light / dark"],
  docs: ["Tài liệu", "資料", "Documents"],
  journal: ["Nhật ký", "日報", "Journal"],
  searchAll: ["Tìm kiếm", "検索", "Search"],
  noResults: ["Không tìm thấy kết quả", "見つかりません", "No results"],
  upload: ["Tải lên", "アップロード", "Upload"],
  uploading: ["Đang tải lên", "アップロード中", "Uploading"],
  dropHint: [
    "Kéo thả file vào trang này, hoặc bấm Tải lên",
    "このページにファイルをドロップ、またはアップロードをクリック",
    "Drop files on this page, or click Upload",
  ],
  noStorage: [
    "Kho lưu file (R2) chưa được bật trên máy chủ nên chưa tải file lên được.",
    "ファイル保存（R2）が未有効のため、アップロードできません。",
    "File storage (R2) is not enabled on the server, so uploads are unavailable.",
  ],
  tooBig: ["File quá lớn (tối đa 95 MB)", "ファイルが大きすぎます（最大 95 MB）", "File too large (max 95 MB)"],
  download: ["Tải về", "ダウンロード", "Download"],
  name: ["Tên", "名前", "Name"],
  noteField: ["Ghi chú", "メモ", "Note"],
  doneThatDay: ["Đã xong trong ngày", "この日に完了", "Completed that day"],
  insert: ["Chèn vào nhật ký", "日報に挿入", "Insert into journal"],
  journalPlaceholder: ["Hôm nay đã làm gì, vướng gì, mai làm gì…", "今日の作業、課題、明日の予定…", "What you did, what blocked you, what's next…"],
  exportMonth: ["Xuất tháng ra Excel", "月次を Excel 出力", "Export month to Excel"],
  paperSize: ["Khổ giấy", "用紙サイズ", "Paper size"],
  info: ["Thông tin", "情報", "Details"],
  history: ["Lịch sử", "履歴", "History"],
  save: ["Lưu", "保存", "Save"],
  comments: ["Bình luận", "コメント", "Comments"],
  files: ["File", "ファイル", "Files"],
  changes: ["Thay đổi", "変更", "Changes"],
  send: ["Gửi", "送信", "Send"],
  attach: ["Đính kèm", "添付", "Attach"],
  attachHint: [
    "Chữ trong ô nhập sẽ thành ghi chú của file. File trùng tên sẽ thành rev mới.",
    "入力欄の文字はファイルのメモになります。同名ファイルは新しい rev になります。",
    "Text in the box becomes the file's note. A file with the same name becomes a new rev.",
  ],
  eventDate: ["Ngày sự kiện", "日付", "Date"],
  created: ["Tạo việc", "タスク作成", "Task created"],
  olderRevs: ["Bản cũ", "旧版", "Older revisions"],
  commentPlaceholder: [
    "Viết bình luận… (Ctrl+Enter để gửi, kéo thả file vào để đính kèm)",
    "コメントを入力…（Ctrl+Enter で送信、ファイルをドロップで添付）",
    "Write a comment… (Ctrl+Enter to send, drop files to attach)",
  ],
  noHistory: ["Chưa có lịch sử", "履歴はまだありません", "No history yet"],
  activityThatDay: ["Bình luận và file trong ngày", "この日のコメント・ファイル", "Comments and files that day"],
  planHours: ["Giờ kế hoạch", "予定工数(h)", "Planned hours"],
  actualHours: ["Giờ thực tế", "実績工数(h)", "Actual hours"],
  checklist: ["Checklist", "チェックリスト", "Checklists"],
  glossary: ["Thuật ngữ", "用語集", "Glossary"],
  templates: ["Mẫu", "テンプレート", "Templates"],
  newTemplate: ["Mẫu mới", "新規テンプレート", "New template"],
  newChecklist: ["Checklist mới", "新規チェックリスト", "New checklist"],
  fromTemplate: ["Tạo từ mẫu", "テンプレートから作成", "From template"],
  blank: ["Trống", "空白", "Blank"],
  templateItemsHint: [
    "Mỗi dòng một mục. Dòng bắt đầu bằng # là tiêu đề nhóm.",
    "1行に1項目。# で始まる行は見出し。",
    "One item per line. Lines starting with # are section headings.",
  ],
  addItem: ["+ Thêm mục", "+ 項目を追加", "+ Add item"],
  saveAsTemplate: ["Lưu thành mẫu", "テンプレートとして保存", "Save as template"],
  resetChecks: ["Bỏ tick tất cả", "チェックを全解除", "Uncheck all"],
  itemNote: ["Ghi chú mục này", "この項目のメモ", "Note for this item"],
  vi: ["Tiếng Việt", "ベトナム語", "Vietnamese"],
  ja: ["Tiếng Nhật", "日本語", "Japanese"],
  reading: ["Cách đọc", "読み", "Reading"],
  en: ["Tiếng Anh", "英語", "English"],
  newTerm: ["Thuật ngữ mới", "新規用語", "New term"],
  groups: ["Nhóm", "グループ", "Groups"],
  group: ["Nhóm", "グループ", "Group"],
  newGroup: ["Nhóm mới", "新規グループ", "New group"],
  noGroup: ["Chưa phân nhóm", "未分類", "Ungrouped"],
  groupName: ["Tên nhóm", "グループ名", "Group name"],
  rename: ["Đổi tên", "名前変更", "Rename"],
  deleteGroup: [
    "Xóa nhóm này? Các thuật ngữ bên trong vẫn được giữ, chuyển sang Chưa phân nhóm.",
    "このグループを削除しますか？用語は残り、未分類になります。",
    "Delete this group? Its terms are kept and become ungrouped.",
  ],
  searchAllGroups: ["Tìm trong tất cả nhóm (không cần dấu)…", "全グループから検索…", "Search all groups…"],
  copied: ["Đã sao chép", "コピーしました", "Copied"],
  fromDocs: ["Từ Tài liệu", "資料から", "From Documents"],
  fromDocsHint: [
    "Gắn một file có sẵn trong trang Tài liệu (bản sao, không cần tải lại)",
    "資料ページの既存ファイルを添付（コピーされます）",
    "Attach a file already in Documents (copied, no re-upload)",
  ],
  confirmDeleteRev: ["Xóa bản file này? Không thể hoàn tác.", "このファイル版を削除しますか？元に戻せません。", "Delete this file revision? This cannot be undone."],
  confirmDeleteTask: [
    "Xóa việc này cùng các việc con, toàn bộ lịch sử và file đính kèm? Không thể hoàn tác.",
    "このタスクと子タスク、履歴、添付ファイルをすべて削除しますか？元に戻せません。",
    "Delete this task, its subtasks, all history and attachments? This cannot be undone.",
  ],
  menu: ["Menu", "メニュー", "Menu"],
  collapse: ["Thu gọn / mở rộng menu", "メニューを折りたたむ / 展開", "Collapse / expand menu"],
  settings: ["Cài đặt", "設定", "Settings"],
  siteName: ["Tên site", "サイト名", "Site name"],
  defaultLanguage: ["Ngôn ngữ mặc định", "既定の言語", "Default language"],
  defaultLanguageHint: [
    "Áp dụng khi trình duyệt chưa chọn ngôn ngữ nào.",
    "ブラウザで言語を選んでいない場合に使われます。",
    "Used when this browser has not picked a language yet.",
  ],
  logo: ["Logo", "ロゴ", "Logo"],
  uploadLogo: ["Tải logo lên", "ロゴをアップロード", "Upload logo"],
  resetLogo: ["Dùng logo mặc định", "既定のロゴに戻す", "Use default logo"],
  logoHint: [
    "SVG hoặc PNG vuông, tối đa 512 KB. Dùng cho menu và biểu tượng tab.",
    "正方形の SVG または PNG、最大 512 KB。メニューとタブのアイコンに使います。",
    "Square SVG or PNG, up to 512 KB. Used in the menu and as the tab icon.",
  ],
  logoTooBig: ["Logo quá lớn (tối đa 512 KB)", "ロゴが大きすぎます（最大 512 KB）", "Logo too large (max 512 KB)"],
  version: ["Phiên bản", "バージョン", "Version"],
  language: ["Ngôn ngữ", "言語", "Language"],
} as const;

export type Key = keyof typeof dict;
export const translate = (lang: Lang, k: Key): string => dict[k][LANGS.indexOf(lang)] ?? dict[k][2];

export const LangCtx = createContext<{ lang: Lang; t: (k: Key) => string }>({
  lang: "en",
  t: (k) => translate("en", k),
});
export const useT = () => useContext(LangCtx);

/* ---------- Small helpers ---------- */

export function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: ignore */
  }
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function fmtDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(locale(lang), {
    month: "short",
    day: "numeric",
  });
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Debounced saver: call save(payload) often; fn runs once things go quiet. */
export function useAutosave<T>(fn: (payload: T) => Promise<unknown>, delay = 700) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current === null) return;
    const payload = pending.current;
    pending.current = null;
    fnRef.current(payload).then(
      () => setState("saved"),
      () => setState("error"),
    );
  };
  const save = (payload: T) => {
    pending.current = payload;
    setState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  };
  useEffect(() => flush, []); // flush on unmount
  return { state, save, flush };
}

export function navigate(to: string) {
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
