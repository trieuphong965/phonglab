import { Pencil, Download, Paperclip, FolderOpen, FileText, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api, locale, todayStr, useT, type Key } from "./lib";

type Kind = "comment" | "file" | "change";
type Ev = { id: string; kind: Kind; event_date: string; body: string; file_id: string | null; created_at: string };
type GFile = { id: string; name: string; rev: number; size: number; type: string; created_at: string };
type Change = { field: string; from?: unknown; to?: unknown };

const MAX = 95 * 1024 * 1024;
const fmtSize = (n: number) =>
  n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";
const FIELD: Record<string, Key> = {
  title: "title",
  start_date: "start",
  end_date: "end",
  progress: "progress",
  assignee: "assignee",
  depends_on: "dependsOn",
  parent_id: "parent",
  plan_hours: "planHours",
  actual_hours: "actualHours",
};
const ICON: Record<Kind, React.ReactNode> = { comment: <MessageSquare />, file: <Paperclip />, change: <Pencil /> };

export default function GanttHistory({ itemId, refresh, onChanged }: { itemId: string; refresh: number; onChanged?: () => void }) {
  const { t, lang } = useT();
  const loc = locale(lang);
  const [data, setData] = useState<{ storage: boolean; events: Ev[]; files: GFile[] } | null>(null);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayStr());
  const [status, setStatus] = useState("");
  const [over, setOver] = useState(false);
  const [picking, setPicking] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const load = () => api<{ storage: boolean; events: Ev[]; files: GFile[] }>(`/gantt/${itemId}/events`).then(setData);
  useEffect(() => {
    load();
  }, [itemId, refresh]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    await api(`/gantt/${itemId}/events`, "POST", { body, event_date: date });
    load();
    onChanged?.();
  }

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
      const form = new FormData();
      form.append("file", f);
      form.append("note", text.trim());
      form.append("event_date", date);
      const res = await fetch(`/api/gantt/${itemId}/files`, { method: "POST", body: form });
      if (!res.ok) failed++;
    }
    setText("");
    setStatus(failed ? `${t("saveError")} (${failed})` : "");
    load();
    onChanged?.();
  }

  async function attachDoc(doc: Doc) {
    setPicking(false);
    setStatus(`${t("uploading")}: ${doc.name}`);
    try {
      await api(`/gantt/${itemId}/files/from-doc`, "POST", { doc_id: doc.id, note: text.trim(), event_date: date });
      setText("");
      setStatus("");
    } catch {
      setStatus(t("saveError"));
    }
    load();
    onChanged?.();
  }

  async function remove(e: Ev) {
    if (!confirm(t(e.kind === "file" ? "confirmDeleteRev" : "confirmDelete"))) return;
    await api(e.kind === "file" ? `/gantt/files/${e.file_id}` : `/gantt/events/${e.id}`, "DELETE");
    load();
    onChanged?.();
  }

  const fileById = useMemo(() => new Map((data?.files ?? []).map((f) => [f.id, f])), [data]);
  const noteByFile = useMemo(
    () => new Map((data?.events ?? []).filter((e) => e.file_id).map((e) => [e.file_id!, e.body])),
    [data],
  );
  /** name -> revisions, newest first */
  const groups = useMemo(() => {
    const m = new Map<string, GFile[]>();
    for (const f of data?.files ?? []) m.set(f.name, [...(m.get(f.name) ?? []), f]);
    return [...m.entries()];
  }, [data]);

  const shown = (data?.events ?? []).filter((e) => filter === "all" || e.kind === filter);
  const day = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(loc, { weekday: "short", year: "numeric", month: "numeric", day: "numeric" });
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(loc, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const val = (field: string, v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : field === "progress" ? `${v}%` : field.endsWith("_hours") ? `${v}h` : String(v);
  const fileLink = (f: GFile, label: string) => (
    <a href={`/api/gantt/files/${f.id}`} target="_blank" rel="noreferrer">{label}</a>
  );

  function renderBody(e: Ev) {
    if (e.kind === "comment")
      return <div className="markdown small-md" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(e.body, { async: false })) }} />;
    if (e.kind === "file") {
      const f = e.file_id ? fileById.get(e.file_id) : undefined;
      return (
        <div>
          {f ? (
            <p className="h-file">
              <span className="rev">rev{f.rev}</span>
              {fileLink(f, f.name)}
              <span className="muted small">{fmtSize(f.size)}</span>
              <a className="muted small" href={`/api/gantt/files/${f.id}?download`} aria-label={t("download")} title={t("download")}><Download /></a>
            </p>
          ) : (
            <p className="muted">—</p>
          )}
          {e.body && <p className="h-note">{e.body}</p>}
        </div>
      );
    }
    let list: Change[] = [];
    try {
      list = JSON.parse(e.body);
    } catch {
      /* unreadable record: show nothing */
    }
    return (
      <ul className="h-changes">
        {list.map((ch, i) =>
          ch.field === "created" ? (
            <li key={i}>{t("created")}</li>
          ) : (
            <li key={i}>
              <span className="muted">{FIELD[ch.field] ? t(FIELD[ch.field]) : ch.field}:</span> {val(ch.field, ch.from)} → <b>{val(ch.field, ch.to)}</b>
            </li>
          ),
        )}
      </ul>
    );
  }

  if (!data) return <p className="muted pad">{t("loading")}</p>;
  let lastDay = "";

  return (
    <div
      className={"history" + (over ? " drop" : "")}
      onDragOver={(e) => { if (data.storage && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (data.storage && e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
    >
      <div className="history-scroll">
        {groups.length > 0 && (
          <section className="h-files">
            <h3>{t("files")} ({groups.length})</h3>
            {groups.map(([name, revs]) => (
              <div key={name} className="h-file-group">
                <p className="h-file">
                  <span className="rev">rev{revs[0].rev}</span>
                  {fileLink(revs[0], name)}
                  <span className="muted small">{stamp(revs[0].created_at)}</span>
                </p>
                {revs.length > 1 && (
                  <details>
                    <summary className="muted small">{t("olderRevs")} ({revs.length - 1})</summary>
                    <ul>
                      {revs.slice(1).map((f) => (
                        <li key={f.id}>
                          <span className="rev old">rev{f.rev}</span>
                          {fileLink(f, stamp(f.created_at))}
                          {noteByFile.get(f.id) && <span className="muted small"> · {noteByFile.get(f.id)}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="chips h-filter">
          {(["all", "comment", "file", "change"] as const).map((k) => (
            <button key={k} className={"chip" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>
              {t(k === "all" ? "allProjects" : k === "comment" ? "comments" : k === "file" ? "files" : "changes")}
            </button>
          ))}
        </div>

        {shown.length === 0 && <p className="muted pad">{t("noHistory")}</p>}
        <ol className="timeline">
          {shown.map((e) => {
            const header = e.event_date !== lastDay ? (lastDay = e.event_date) : null;
            return (
              <li key={e.id} className={"ev " + e.kind}>
                {header && <h4 className="ev-day">{day(header)}</h4>}
                <div className="ev-row">
                  <span className="ev-icon" aria-hidden="true">{ICON[e.kind]}</span>
                  <div className="ev-main">
                    {renderBody(e)}
                    <span className="ev-time">
                      {stamp(e.created_at)}
                      {e.kind !== "change" && (
                        <button className="link-btn" onClick={() => remove(e)}>{t("del")}</button>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
          placeholder={t("commentPlaceholder")}
          aria-label={t("commentPlaceholder")}
        />
        {status && <p className="muted small">{status}</p>}
        <div className="composer-bar">
          <label className="ev-date">{t("eventDate")}
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <span className="grow" />
          <button type="button" className="btn" disabled={!data.storage} title={data.storage ? t("attachHint") : t("noStorage")} onClick={() => picker.current?.click()}><Paperclip />{t("attach")}</button>
          <input ref={picker} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
          <button type="button" className="btn" disabled={!data.storage} title={t("fromDocsHint")} onClick={() => setPicking(true)}><FolderOpen />{t("fromDocs")}</button>
          <button type="submit" className="btn primary" disabled={!text.trim()}>{t("send")}</button>
        </div>
      </form>
      {picking && <DocPicker onPick={attachDoc} onClose={() => setPicking(false)} />}
    </div>
  );
}

type Doc = { id: string; name: string; size: number; tags: string; note: string; created_at: string };

/** Search-as-you-type list of the files in Documents. */
function DocPicker({ onPick, onClose }: { onPick: (d: Doc) => void; onClose: () => void }) {
  const { t, lang } = useT();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    api<{ items: Doc[] }>("/docs").then((r) => setDocs(r.items));
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (docs ?? []).filter((d) => !needle || (d.name + " " + d.tags + " " + d.note).toLowerCase().includes(needle));

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && shown[active]) { e.preventDefault(); onPick(shown[active]); }
  }

  return (
    <div className="modal-wrap top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("fromDocs")}>
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder={t("fromDocs") + "…"} aria-label={t("search")} />
        {docs === null && <p className="muted pad">{t("loading")}</p>}
        {docs && shown.length === 0 && <p className="muted pad">{docs.length ? t("noResults") : t("empty")}</p>}
        {shown.length > 0 && (
          <ul>
            {shown.map((d, i) => (
              <li key={d.id}>
                <button className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => onPick(d)}>
                  <span className="kind"><FileText /></span>
                  <span className="grow">
                    <strong>{d.name}</strong>
                    <span className="excerpt">
                      {fmtSize(d.size)} · {new Date(d.created_at).toLocaleDateString(locale(lang))}
                      {d.tags ? " · " + d.tags : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
