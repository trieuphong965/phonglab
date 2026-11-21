import { Pencil, Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, fmtDate, useT } from "../lib";

type Doc = { id: string; name: string; size: number; type: string; tags: string; note: string; created_at: string };

const MAX = 95 * 1024 * 1024;
const fmtSize = (n: number) =>
  n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";
const badge = (d: Doc) => {
  const ext = d.name.includes(".") ? d.name.split(".").pop()! : "";
  return (ext || d.type.split("/").pop() || "file").slice(0, 4).toUpperCase();
};
const tagsOf = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function Docs() {
  const { t, lang } = useT();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [storage, setStorage] = useState(true);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState<Doc | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = () =>
    api<{ storage: boolean; items: Doc[] }>("/docs").then((r) => {
      setDocs(r.items);
      setStorage(r.storage);
    });
  useEffect(() => {
    load();
  }, []);

  async function upload(files: FileList | File[]) {
    const all = [...files];
    let failed = 0;
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      setStatus(`${t("uploading")} ${i + 1}/${all.length}: ${f.name}`);
      if (f.size > MAX) {
        failed++;
        alert(`${f.name}: ${t("tooBig")}`);
        continue;
      }
      const body = new FormData();
      body.append("file", f);
      if (tag) body.append("tags", tag);
      const res = await fetch("/api/docs", { method: "POST", body });
      if (!res.ok) failed++;
    }
    setStatus(failed ? `${t("saveError")} (${failed})` : "");
    load();
  }

  async function saveEdit() {
    if (!editing) return;
    const { id, name, tags, note } = editing;
    setEditing(null);
    await api("/docs/" + id, "PUT", { name, tags, note });
    load();
  }

  async function remove(d: Doc) {
    if (!confirm(t("confirmDelete"))) return;
    setEditing(null);
    await api("/docs/" + d.id, "DELETE");
    load();
  }

  const allTags = [...new Set((docs ?? []).flatMap((d) => tagsOf(d.tags)))].sort();
  const needle = q.trim().toLowerCase();
  const shown = (docs ?? []).filter(
    (d) =>
      (!tag || tagsOf(d.tags).includes(tag)) &&
      (!needle || (d.name + " " + d.tags + " " + d.note).toLowerCase().includes(needle)),
  );

  return (
    <div
      className={"page docs" + (over ? " drop" : "")}
      onDragOver={(e) => { if (storage && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (storage && e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
    >
      <header className="page-head">
        <h1>{t("docs")}</h1>
        <input type="search" className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        <button className="btn primary" disabled={!storage} onClick={() => picker.current?.click()}><Upload />{t("upload")}</button>
        <input ref={picker} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
      </header>

      {!storage && <p className="notice">{t("noStorage")}</p>}
      {status && <p className="muted small">{status}</p>}

      {allTags.length > 0 && (
        <div className="chips" style={{ marginBottom: 14 }}>
          <button className={"chip" + (tag === null ? " on" : "")} onClick={() => setTag(null)}>{t("allProjects")}</button>
          {allTags.map((g) => <button key={g} className={"chip" + (tag === g ? " on" : "")} onClick={() => setTag(g)}>{g}</button>)}
        </div>
      )}

      <ul className="doc-list">
        {shown.map((d) => (
          <li key={d.id}>
            <span className="doc-badge">{badge(d)}</span>
            <a className="grow doc-name" href={`/api/docs/${d.id}/file`} target="_blank" rel="noreferrer">
              <strong>{d.name}</strong>
              <span className="meta">
                {fmtSize(d.size)} · {fmtDate(d.created_at, lang)}
                {tagsOf(d.tags).map((g) => <i key={g} className="tag">{g}</i>)}
                {d.note && <span className="excerpt">{d.note}</span>}
              </span>
            </a>
            <a className="btn" href={`/api/docs/${d.id}/file?download`} title={t("download")} aria-label={t("download")}><Download /></a>
            <button className="btn" title={t("edit")} aria-label={t("edit")} onClick={() => setEditing(d)}><Pencil /></button>
          </li>
        ))}
      </ul>
      {docs && shown.length === 0 && <p className="muted placeholder-box">{docs.length ? t("noResults") : storage ? t("dropHint") : t("empty")}</p>}

      {editing && (
        <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && saveEdit()}>
          <div className="modal" role="dialog" aria-modal="true">
            <label className="field">{t("name")}
              <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="field">{t("tagsPlaceholder")}
              <input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
            </label>
            <label className="field">{t("noteField")}
              <textarea rows={3} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </label>
            <div className="modal-foot">
              <button className="btn danger" onClick={() => remove(editing)}>{t("del")}</button>
              <span className="grow" />
              <button className="btn primary" onClick={saveEdit}>{t("close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
