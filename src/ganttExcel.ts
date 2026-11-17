import ExcelJS from "exceljs";
import { buildRows, dayDate, describeChange, fromDay, type GanttItem, type HistEvent } from "./gantt";
import { locale, translate, type Lang } from "./lib";

const HEAD = {
  vi: ["No", "Công việc", "Phụ trách", "Bắt đầu", "Kết thúc", "%", "Giờ KH", "Giờ TT"],
  ja: ["No", "タスク", "担当", "開始", "終了", "進捗%", "予定h", "実績h"],
  en: ["No", "Task", "Assignee", "Start", "End", "%", "Plan h", "Actual h"],
};
const FIXED = 8;

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const line = { style: "thin" as const, color: { argb: "FFD9D9D9" } };
const border = { top: line, left: line, bottom: line, right: line };

export async function exportGanttExcel(items: GanttItem[], lang: Lang, events: HistEvent[] = []) {
  const rows = buildRows(items, true);
  if (!rows.length) return;
  const min = Math.min(...rows.map((r) => r.start)) - 1;
  const max = Math.max(...rows.map((r) => r.end)) + 3;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(lang === "ja" ? "工程表" : lang === "vi" ? "Tiến độ" : "Schedule", {
    views: [{ state: "frozen", xSplit: FIXED, ySplit: 2 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 as never },
  });

  [5, 38, 12, 11, 11, 7, 8, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let n = min; n <= max; n++) ws.getColumn(FIXED + 1 + n - min).width = 3;

  /* header: fixed columns span both rows; months over days */
  HEAD[lang].forEach((h, i) => {
    ws.mergeCells(1, i + 1, 2, i + 1);
    ws.getCell(1, i + 1).value = h;
  });
  let monthStart = min;
  for (let n = min; n <= max; n++) {
    const d = dayDate(n);
    const col = FIXED + 1 + n - min;
    const dow = d.getUTCDay();
    const cell = ws.getCell(2, col);
    cell.value = d.getUTCDate();
    if (dow === 0) cell.font = { color: { argb: "FFC00000" }, size: 9 };
    else if (dow === 6) cell.font = { color: { argb: "FF1F4E9C" }, size: 9 };
    else cell.font = { size: 9 };
    const last = n === max || dayDate(n + 1).getUTCMonth() !== d.getUTCMonth();
    if (last) {
      const c1 = FIXED + 1 + monthStart - min;
      if (col > c1) ws.mergeCells(1, c1, 1, col);
      ws.getCell(1, c1).value = `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`;
      monthStart = n + 1;
    }
  }
  for (const r of [1, 2])
    ws.getRow(r).eachCell({ includeEmpty: true }, (c) => {
      c.fill = fill("FFDDEBF7");
      c.border = border;
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.font = { ...c.font, bold: true };
    });

  /* body */
  rows.forEach((r, i) => {
    const rowNo = i + 3;
    const row = ws.getRow(rowNo);
    row.values = [
      i + 1,
      r.item.title,
      r.item.assignee,
      fromDay(r.start).replaceAll("-", "/"),
      fromDay(r.end).replaceAll("-", "/"),
      r.progress,
      r.plan ?? "",
      r.actual ?? "",
    ];
    row.getCell(2).alignment = { indent: r.depth * 2, vertical: "middle" };
    if (r.isGroup) row.font = { bold: true };
    for (const c of [1, 3, 4, 5, 6, 7, 8]) row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };

    const len = r.end - r.start + 1;
    const doneDays = Math.round((len * r.progress) / 100);
    for (let n = min; n <= max; n++) {
      const cell = row.getCell(FIXED + 1 + n - min);
      const dow = dayDate(n).getUTCDay();
      cell.border = border;
      if (n >= r.start && n <= r.end) {
        const done = n - r.start < doneDays;
        cell.fill = fill(r.isGroup ? (done ? "FF7F7F7F" : "FFBFBFBF") : done ? "FF2F75B5" : "FF9DC3E6");
      } else if (dow === 0) cell.fill = fill("FFFDE9E7");
      else if (dow === 6) cell.fill = fill("FFE8EEFB");
    }
    for (let c = 1; c <= FIXED; c++) row.getCell(c).border = border;
  });

  /* second sheet: every task's history, in the same order and numbering as the chart */
  const no = new Map(rows.map((r, i) => [r.item.id, { no: i + 1, title: r.item.title }]));
  const hist = events
    .filter((e) => no.has(e.item_id))
    .sort(
      (a, b) =>
        no.get(a.item_id)!.no - no.get(b.item_id)!.no ||
        a.event_date.localeCompare(b.event_date) ||
        a.created_at.localeCompare(b.created_at),
    );
  if (hist.length) {
    const L = (k: Parameters<typeof translate>[1]) => translate(lang, k);
    const hs = wb.addWorksheet(lang === "ja" ? "変更履歴" : lang === "vi" ? "Lịch sử" : "History", {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 as never },
    });
    hs.columns = [{ width: 6 }, { width: 30 }, { width: 12 }, { width: 11 }, { width: 70 }, { width: 17 }];
    hs.addRow(
      lang === "ja"
        ? ["No", "タスク", "日付", "種類", "内容", "記録日時"]
        : lang === "vi"
          ? ["No", "Công việc", "Ngày", "Loại", "Nội dung", "Thời điểm ghi"]
          : ["No", "Task", "Date", "Type", "Content", "Recorded at"],
    );
    hs.getRow(1).eachCell((c) => {
      c.fill = fill("FFDDEBF7");
      c.border = border;
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    const kind = { comment: L("comments"), file: L("files"), change: L("changes") };
    const loc = locale(lang);
    for (const e of hist) {
      const task = no.get(e.item_id)!;
      const content =
        e.kind === "comment"
          ? e.body
          : e.kind === "file"
            ? `${e.name ?? "?"} rev${e.rev ?? "?"}${e.body ? "\n" + e.body : ""}`
            : describeChange(e.body, L).join("\n");
      const row = hs.addRow([
        task.no,
        task.title,
        e.event_date.replaceAll("-", "/"),
        kind[e.kind],
        content,
        new Date(e.created_at).toLocaleString(loc, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
      ]);
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.border = border;
        c.alignment = { vertical: "top", wrapText: col === 2 || col === 5, horizontal: col === 2 || col === 5 ? "left" : "center" };
        if (e.kind === "change") c.font = { color: { argb: "FF7F7F7F" } };
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `phonglab-gantt-${fromDay(Math.floor(Date.now() / 864e5))}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
