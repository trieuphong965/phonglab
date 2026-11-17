import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const SCALE = 2; // render at 2x so text stays sharp when printed

async function render(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  if (!elements.length) return null;
  const blob = await exportToBlob({
    elements,
    // Always export the light version: it is what prints well.
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
    files: api.getFiles(),
    mimeType: "image/png",
    exportPadding: 24,
    getDimensions: (w: number, h: number) => ({ width: w * SCALE, height: h * SCALE, scale: SCALE }),
  });
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width / SCALE, height: bmp.height / SCALE };
  bmp.close();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ...size };
}

const fileName = (title: string, ext: string) =>
  (title.trim().replace(/[\\/:*?"<>|]+/g, "_") || "flowchart") + "." + ext;

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type Paper = "a4" | "a3";

/** One page (A4 or A3), orientation chosen from the drawing's shape, scaled down to fit. */
export async function exportFlowPdf(api: ExcalidrawImperativeAPI, title: string, paper: Paper = "a4") {
  const img = await render(api);
  if (!img) return false;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: img.width >= img.height ? "landscape" : "portrait", unit: "mm", format: paper });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 10;
  // 0.2646 mm per CSS pixel = actual size; never enlarge beyond that.
  const k = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height, 0.2646);
  const w = img.width * k;
  const h = img.height * k;
  doc.addImage(img.bytes, "PNG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
  saveBlob(doc.output("blob"), fileName(title, "pdf"));
  return true;
}

/** The drawing as a picture on a worksheet (Excel cannot hold it as editable shapes). */
export async function exportFlowExcel(api: ExcalidrawImperativeAPI, title: string, paper: Paper = "a4") {
  const img = await render(api);
  if (!img) return false;
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Flowchart", { pageSetup: { orientation: img.width >= img.height ? "landscape" : "portrait", fitToPage: true, paperSize: (paper === "a3" ? 8 : 9) as never } });
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 14 };
  const k = Math.min(1, 1400 / img.width);
  const id = wb.addImage({ buffer: img.bytes.buffer as ArrayBuffer, extension: "png" });
  ws.addImage(id, { tl: { col: 0, row: 2 }, ext: { width: img.width * k, height: img.height * k } });
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(title, "xlsx"));
  return true;
}
