import { useEffect, useState } from "react";
import { api, fmtDate, navigate, useAutosave, useT } from "../lib";

type Item = { text: string; done: boolean; note: string };
type List = { id: string; template_id: string | null; name: string; items: string; updated_at: string };
type Template = { id: string; name: string; items: string };

/** Lines starting with "#" are section headings, not things to tick. */
const isHeading = (text: string) => text.startsWith("#");
const parse = <T,>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
const count = (items: Item[]) => {
  const real = items.filter((i) => !isHeading(i.text));
  return { done: real.filter((i) => i.done).length, total: real.length };
};

export default function Checklist({ selected }: { selected?: string }) {
  const { t, lang } = useT();
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [current, setCurrent] = useState<{ id: string; name: string; items: Item[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [tplEdit, setTplEdit] = useState<{ id: string | null; name: string; text: string } | null>(null);
  const [newItem, setNewItem] = useState("");
  const [openNote, setOpenNote] = useState<number | null>(null);

  const load = () =>
    api<{ templates: Template[]; lists: List[] }>("/checklists").then((r) => {
      setTemplates(r.templates);
      setLists(r.lists);
      return r;
    });

  const { state, save, flush } = useAutosave<{ id: string; name: string; items: Item[] }>(async (d) => {
    await api("/checklists/" + d.id, "PUT", { name: d.name, items: d.items });
    load();
  }, 500);

  useEffect(() => {
    flush();
    setOpenNote(null);
    load().then((r) => {
      const l = selected ? r.lists.find((x) => x.id === selected) : undefined;
      setCurrent(l ? { id: l.id, name: l.name, items: parse<Item[]>(l.items, []) } : null);
    });
  }, [selected]);

  function update(next: { id: string; name: string; items: Item[] }) {
    setCurrent(next);
    save(next);
  }
  const setItems = (items: Item[]) => current && update({ ...current, items });
  const patchItem = (i: number, p: Partial<Item>) =>
    current && setItems(current.items.map((it, k) => (k === i ? { ...it, ...p } : it)));

  async function create(name: string, templateId: string) {
    setCreating(false);
    const { id } = await api<{ id: string }>("/checklists", "POST", { name, template_id: templateId || undefined });
    navigate("/checklist/" + id);
  }

  async function removeList() {
    if (!current || !confirm(t("confirmDelete"))) return;
    await api("/checklists/" + current.id, "DELETE");
    navigate("/checklist");
  }

  async function saveTemplate() {
    if (!tplEdit) return;
    const items = tplEdit.text.split("\n").map((s) => s.trim()).filter(Boolean);
    const body = { name: tplEdit.name.trim() || t("untitled"), items };
    if (tplEdit.id) await api("/checklist-templates/" + tplEdit.id, "PUT", body);
    else await api("/checklist-templates", "POST", body);
    setTplEdit(null);
    load();
  }

  async function removeTemplate() {
    if (!tplEdit?.id || !confirm(t("confirmDelete"))) return;
    await api("/checklist-templates/" + tplEdit.id, "DELETE");
    setTplEdit(null);
    load();
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text || !current) return;
    setNewItem("");
    setItems([...current.items, { text, done: false, note: "" }]);
  }

  const c = current ? count(current.items) : null;

  return (
    <div className={"split" + (selected ? " has-detail" : "")}>
      <div className="list-pane">
        <div className="list-head">
          <button className="btn primary" onClick={() => setCreating(true)}>+ {t("newChecklist")}</button>
        </div>
        <ul className="note-list grow-list">
          {lists.map((l) => {
            const k = count(parse<Item[]>(l.items, []));
            return (
              <li key={l.id}>
                <a href={"/checklist/" + l.id} className={l.id === selected ? "active" : ""} onClick={(e) => { e.preventDefault(); navigate("/checklist/" + l.id); }}>
                  <strong>{l.name}</strong>
                  <span className="meter" aria-hidden="true"><i style={{ width: k.total ? (k.done / k.total) * 100 + "%" : 0 }} /></span>
                  <span className="meta">{k.done}/{k.total} · {fmtDate(l.updated_at, lang)}</span>
                </a>
              </li>
            );
          })}
          {lists.length === 0 && <li className="muted pad">{t("empty")}</li>}
        </ul>
        <div className="tpl-box">
          <div className="tpl-head">
            <strong>{t("templates")}</strong>
            <button className="link-btn" onClick={() => setTplEdit({ id: null, name: "", text: "" })}>+ {t("newTemplate")}</button>
          </div>
          {templates.map((tp) => (
            <button key={tp.id} className="tpl-item" onClick={() => setTplEdit({ id: tp.id, name: tp.name, text: parse<string[]>(tp.items, []).join("\n") })}>
              {tp.name} <span className="muted small">({parse<string[]>(tp.items, []).filter((x) => !isHeading(x)).length})</span>
            </button>
          ))}
          {templates.length === 0 && <p className="muted small">{t("empty")}</p>}
        </div>
      </div>

      <div className="detail-pane">
        {!current ? (
          <p className="muted placeholder">{selected ? t("loading") : t("selectNote")}</p>
        ) : (
          <>
            <div className="toolbar">
              <button className="btn back" onClick={() => navigate("/checklist")}>←</button>
              <span className={"save-state " + state}>
                {state === "saving" ? t("saving") : state === "saved" ? t("saved") : state === "error" ? t("saveError") : ""}
              </span>
              <span className="grow" />
              <button className="btn" onClick={() => setTplEdit({ id: null, name: current.name, text: current.items.map((i) => i.text).join("\n") })}>{t("saveAsTemplate")}</button>
              <button className="btn" onClick={() => setItems(current.items.map((i) => ({ ...i, done: false })))}>{t("resetChecks")}</button>
              <button className="btn danger" onClick={removeList}>{t("del")}</button>
            </div>
            <input className="title-input" value={current.name} onChange={(e) => update({ ...current, name: e.target.value })} aria-label={t("title")} />
            {c && (
              <div className="check-progress">
                <span className="meter big"><i style={{ width: c.total ? (c.done / c.total) * 100 + "%" : 0 }} /></span>
                <b>{c.done}/{c.total}</b>
              </div>
            )}
            <ul className="check-list">
              {current.items.map((it, i) =>
                isHeading(it.text) ? (
                  <li key={i} className="check-heading">
                    <input value={it.text.replace(/^#+\s*/, "")} onChange={(e) => patchItem(i, { text: "# " + e.target.value })} aria-label={t("title")} />
                    <button className="link-btn" onClick={() => setItems(current.items.filter((_, k) => k !== i))} aria-label={t("del")}>×</button>
                  </li>
                ) : (
                  <li key={i} className={it.done ? "done" : ""}>
                    <div className="check-row">
                      <input type="checkbox" checked={it.done} onChange={(e) => patchItem(i, { done: e.target.checked })} aria-label={it.text} />
                      <input className="check-text" value={it.text} onChange={(e) => patchItem(i, { text: e.target.value })} aria-label={t("title")} />
                      <button className={"link-btn" + (it.note ? " has" : "")} title={t("itemNote")} aria-label={t("itemNote")} onClick={() => setOpenNote(openNote === i ? null : i)}>📝</button>
                      <button className="link-btn" onClick={() => setItems(current.items.filter((_, k) => k !== i))} aria-label={t("del")}>×</button>
                    </div>
                    {(openNote === i || it.note) && (
                      <textarea className="check-note" rows={openNote === i ? 2 : 1} value={it.note} onFocus={() => setOpenNote(i)} onChange={(e) => patchItem(i, { note: e.target.value })} placeholder={t("itemNote")} aria-label={t("itemNote")} />
                    )}
                  </li>
                ),
              )}
            </ul>
            <form onSubmit={addItem} className="check-add">
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={t("addItem") + "  (# …)"} aria-label={t("addItem")} />
            </form>
          </>
        )}
      </div>

      {creating && <CreateDialog templates={templates} onCreate={create} onClose={() => setCreating(false)} />}

      {tplEdit && (
        <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && setTplEdit(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <input className="title-input" autoFocus value={tplEdit.name} onChange={(e) => setTplEdit({ ...tplEdit, name: e.target.value })} placeholder={t("title")} aria-label={t("title")} />
            <p className="muted small">{t("templateItemsHint")}</p>
            <textarea rows={12} value={tplEdit.text} onChange={(e) => setTplEdit({ ...tplEdit, text: e.target.value })} aria-label={t("templates")} />
            <div className="modal-foot">
              {tplEdit.id && <button className="btn danger" onClick={removeTemplate}>{t("del")}</button>}
              <span className="grow" />
              <button className="btn" onClick={() => setTplEdit(null)}>{t("close")}</button>
              <button className="btn primary" onClick={saveTemplate}>{t("save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateDialog({ templates, onCreate, onClose }: { templates: Template[]; onCreate: (name: string, tpl: string) => void; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState(templates[0]?.id ?? "");
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim(), tpl); }}>
        <label className="field">{t("title")}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Line 3 / 出荷検査 …" />
        </label>
        <label className="field">{t("fromTemplate")}
          <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">{t("blank")}</option>
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <div className="modal-foot">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>{t("close")}</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>{t("newChecklist")}</button>
        </div>
      </form>
    </div>
  );
}
