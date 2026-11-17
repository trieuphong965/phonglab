import { useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { api, navigate, fmtDate, useAutosave, useT, type FlowItem } from "../lib";

type Scene = { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> };

export default function Flow({ selected, theme }: { selected?: string; theme: string }) {
  const { t, lang } = useT();
  const [list, setList] = useState<FlowItem[]>([]);
  const [flow, setFlow] = useState<(FlowItem & { scene: Scene }) | null>(null);

  const canvasApi = useRef<ExcalidrawImperativeAPI | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<"pdf" | "excel" | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".menu-anchor") && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  async function exportAs(kind: "pdf" | "excel", paper: "a4" | "a3") {
    if (!canvasApi.current || !flow) return;
    setBusy(true);
    try {
      const m = await import("../flowExport");
      const ok = await (kind === "pdf" ? m.exportFlowPdf : m.exportFlowExcel)(canvasApi.current, flow.title, paper);
      if (!ok) alert(t("empty"));
    } finally {
      setBusy(false);
    }
  }

  const loadList = () => api<FlowItem[]>("/flows").then(setList);
  useEffect(() => {
    loadList();
  }, []);

  const { state, save, flush } = useAutosave<{ id: string; title?: string; data?: string }>(
    async ({ id, ...body }) => {
      await api("/flows/" + id, "PUT", body);
      if (body.title !== undefined) loadList();
    },
    1000,
  );

  useEffect(() => {
    flush();
    setFlow(null);
    if (!selected) return;
    let live = true;
    api<FlowItem>("/flows/" + selected).then(
      (f) => {
        if (!live) return;
        let scene: Scene = {};
        try {
          scene = JSON.parse(f.data || "{}");
        } catch {
          /* corrupt data: start blank */
        }
        setFlow({ ...f, scene });
      },
      () => live && navigate("/flow"),
    );
    return () => {
      live = false;
    };
  }, [selected]);

  async function create() {
    const { id } = await api<{ id: string }>("/flows", "POST", { title: "" });
    await loadList();
    navigate("/flow/" + id);
  }

  async function remove() {
    if (!flow || !confirm(t("confirmDelete"))) return;
    await api("/flows/" + flow.id, "DELETE");
    navigate("/flow");
    loadList();
  }

  return (
    <div className={"split flow" + (selected ? " has-detail" : "")}>
      <div className="list-pane narrow">
        <div className="list-head">
          <button className="btn primary wide" onClick={create}>+ {t("newFlow")}</button>
        </div>
        <ul className="note-list">
          {list.map((f) => (
            <li key={f.id}>
              <a href={"/flow/" + f.id} className={f.id === selected ? "active" : ""} onClick={(e) => { e.preventDefault(); navigate("/flow/" + f.id); }}>
                <strong>{f.title || t("untitled")}</strong>
                <span className="meta">{fmtDate(f.updated_at, lang)}</span>
              </a>
            </li>
          ))}
          {list.length === 0 && <li className="muted pad">{t("empty")}</li>}
        </ul>
      </div>

      <div className="detail-pane canvas-pane">
        {!flow ? (
          <p className="muted placeholder">{selected ? t("loading") : t("selectFlow")}</p>
        ) : (
          <>
            <div className="toolbar">
              <button className="btn back" onClick={() => navigate("/flow")}>←</button>
              <input
                className="title-input inline"
                value={flow.title}
                placeholder={t("title")}
                aria-label={t("title")}
                onChange={(e) => {
                  setFlow({ ...flow, title: e.target.value });
                  save({ id: flow.id, title: e.target.value });
                }}
              />
              <span className={"save-state " + state}>
                {state === "saving" ? t("saving") : state === "saved" ? t("saved") : state === "error" ? t("saveError") : ""}
              </span>
              {(["pdf", "excel"] as const).map((kind) => (
                <span key={kind} className="menu-anchor">
                  <button className="btn" disabled={busy} aria-haspopup="menu" aria-expanded={menu === kind} onClick={() => setMenu(menu === kind ? null : kind)}>
                    ⬇ {kind === "pdf" ? "PDF" : "Excel"}
                  </button>
                  {menu === kind && (
                    <span className="menu" role="menu">
                      <small>{t("paperSize")}</small>
                      {(["a4", "a3"] as const).map((p) => (
                        <button key={p} role="menuitem" onClick={() => { setMenu(null); exportAs(kind, p); }}>{p.toUpperCase()}</button>
                      ))}
                    </span>
                  )}
                </span>
              ))}
              <button className="btn danger" onClick={remove}>{t("del")}</button>
            </div>
            <div className="canvas">
              <Excalidraw
                key={flow.id}
                excalidrawAPI={(a) => (canvasApi.current = a)}
                langCode={lang === "vi" ? "vi-VN" : lang === "ja" ? "ja-JP" : "en"}
                theme={theme === "dark" ? "dark" : "light"}
                initialData={{
                  elements: (flow.scene.elements ?? []) as never,
                  appState: { viewBackgroundColor: flow.scene.appState?.viewBackgroundColor as string | undefined },
                  files: (flow.scene.files ?? {}) as never,
                }}
                onChange={(elements, appState, files) => {
                  const data = JSON.stringify({
                    elements: elements.filter((el) => !el.isDeleted),
                    appState: { viewBackgroundColor: appState.viewBackgroundColor },
                    files,
                  });
                  // Excalidraw fires onChange on every pointer move; only save real changes.
                  if (data === lastSaved.get(flow.id)) return;
                  const first = !lastSaved.has(flow.id);
                  lastSaved.set(flow.id, data);
                  if (!first) save({ id: flow.id, data });
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const lastSaved = new Map<string, string>();
