import ExcelJS from "exceljs";
import { locale, type Lang } from "./lib";

const line = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const border = { top: line, left: line, bottom: line, right: line };

/** One row per calendar day of the month, so empty days are visible too. */
export async function exportJournalExcel(month: string, entries: { date: string; content: string }[], lang: Lang) {
  const [y, m] = month.split("-").map(Number);
  const byDate = new Map(entries.map((e) => [e.date, e.content]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(month, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 13 }, { width: 6 }, { width: 90 }];
  ws.addRow(lang === "ja" ? ["日付", "曜日", "作業内容"] : lang === "vi" ? ["Ngày", "Thứ", "Nội dung"] : ["Date", "Day", "Notes"]);
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
    c.alignment = { horizontal: "center" };
    c.border = border;
  });

  const days = new Date(y, m, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    const row = ws.addRow([
      date.replaceAll("-", "/"),
      dt.toLocaleDateString(locale(lang), { weekday: "short" }),
      byDate.get(date)?.trim() ?? "",
    ]);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = border;
      c.alignment = { vertical: "top", wrapText: col === 3, horizontal: col === 3 ? "left" : "center" };
      if (dow === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9E7" } };
      else if (dow === 6) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFB" } };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = `phonglab-journal-${month}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
