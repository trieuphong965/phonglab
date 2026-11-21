import { ArrowLeft, Pin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api, navigate, fmtDate, useAutosave, useT, type NoteItem } from "../lib";

type Draft = { id: string; title: string; content: string; tags: string };

export default function Notes({ selected }: { selected?: string }) {
  const { t, lang } = useT();
  const [list, setList] = useState<NoteItem[]>([]);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<NoteItem | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const loadList = (query = q) =>
    api<NoteItem[]>("/notes" + (query ? "?q=" + encodeURIComponent(query) : "")).then(setList);

  const { state, save, flush } = useAutosave<Draft>(async (d) => {
    await api("/notes/" + d.id, "PUT", { title: d.title, content: d.content, tags: d.tags });
    loadList();
  });

  useEffect(() => {
    const id = setTimeout(() => loadList(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    flush();
    setNote(null);
    if (!selected) return;
    let live = true;
    api<NoteItem>("/notes/" + selected).then(
      (n) => live && setNote(n),
      () => live && navigate("/notes"),
    );
    return () => {
      live = false;
    };
  }, [selected]);

  function change(patch: Partial<NoteItem>) {
    if (!note) return;
    const next = { ...note, ...patch };
    setNote(next);
    save({ id: next.id, title: next.title, content: next.content ?? "", tags: next.tags });
  }

  async function create() {
    const { id } = await api<{ id: string }>("/notes", "POST", { title: "", content: "" });
    await loadList();
    setMode("edit");
    navigate("/notes/" + id);
  }

  async function togglePin() {
    if (!note) return;
    const pinned = note.pinned ? 0 : 1;
    setNote({ ...note, pinned });
    await api("/notes/" + note.id, "PUT", { pinned });
    loadList();
  }

  async function remove() {
    if (!note || !confirm(t("confirmDelete"))) return;
    await api("/notes/" + note.id, "DELETE");
    navigate("/notes");
    loadList();
  }

  const html = useMemo(
    () => (mode === "preview" && note ? DOMPurify.sanitize(marked.parse(note.content ?? "", { async: false })) : ""),
    [mode, note?.content],
  );

  return (
    <div className={"split" + (selected ? " has-detail" : "")}>
      <div className="list-pane">
        <div className="list-head">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          <button className="btn primary" onClick={create}>+ {t("newNote")}</button>
        </div>
        <ul className="note-list">
          {list.map((n) => (
            <li key={n.id}>
              <a
                href={"/notes/" + n.id}
                className={n.id === selected ? "active" : ""}
                onClick={(e) => { e.preventDefault(); navigate("/notes/" + n.id); }}
              >
                <strong>{n.pinned ? <Pin /> : null}{n.title || t("untitled")}</strong>
                <span className="excerpt">{n.excerpt}</span>
                <span className="meta">
                  {fmtDate(n.updated_at, lang)}
                  {n.tags && n.tags.split(",").map((g) => g.trim()).filter(Boolean).map((g) => <i key={g} className="tag">{g}</i>)}
                </span>
              </a>
            </li>
          ))}
          {list.length === 0 && <li className="muted pad">{t("empty")}</li>}
        </ul>
      </div>

      <div className="detail-pane">
        {!note ? (
          <p className="muted placeholder">{selected ? t("loading") : t("selectNote")}</p>
        ) : (
          <>
            <div className="toolbar">
              <button className="btn back" onClick={() => navigate("/notes")}><ArrowLeft /></button>
              <div className="seg">
                <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>{t("edit")}</button>
                <button className={mode === "preview" ? "on" : ""} onClick={() => setMode("preview")}>{t("preview")}</button>
              </div>
              <span className={"save-state " + state}>
                {state === "saving" ? t("saving") : state === "saved" ? t("saved") : state === "error" ? t("saveError") : ""}
              </span>
              <span className="grow" />
              <button className="btn" onClick={togglePin}>{note.pinned ? t("unpin") : t("pin")}</button>
              <button className="btn danger" onClick={remove}>{t("del")}</button>
            </div>
            <input className="title-input" value={note.title} onChange={(e) => change({ title: e.target.value })} placeholder={t("title")} aria-label={t("title")} />
            <input className="tags-input" value={note.tags} onChange={(e) => change({ tags: e.target.value })} placeholder={t("tagsPlaceholder")} aria-label={t("tagsPlaceholder")} />
            {mode === "edit" ? (
              <textarea className="editor" value={note.content ?? ""} onChange={(e) => change({ content: e.target.value })} placeholder={t("writePlaceholder")} aria-label={t("writePlaceholder")} />
            ) : (
              <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
