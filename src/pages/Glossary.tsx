import { useEffect, useState } from "react";
import { api, navigate, store, stored, useT } from "../lib";

type Term = { id: string; vi: string; ja: string; reading: string; en: string; note: string; tags: string; group_id: string | null };
type Group = { id: string; name: string; position: number };
type Draft = Omit<Term, "id"> & { id: string | null };

const EMPTY: Omit<Term, "id"> = { vi: "", ja: "", reading: "", en: "", note: "", tags: "", group_id: null };
const tagsOf = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const NONE = "__none__";

// Match without Vietnamese diacritics too, so "dong co" finds "động cơ".
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export default function Glossary({ selected }: { selected?: string }) {
  const { t } = useT();
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  /** null = all groups, NONE = terms without a group */
  const [group, setGroup] = useState<string | null>(() => stored("glossary-group", "") || null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [flash, setFlash] = useState("");

  const load = () =>
    api<{ groups: Group[]; terms: Term[] }>("/glossary").then((r) => {
      setTerms(r.terms);
      setGroups(r.groups);
      return r;
    });
  useEffect(() => {
    load().then((r) => {
      const hit = selected && r.terms.find((x) => x.id === selected);
      if (hit) setEditing(hit);
      // A remembered group that no longer exists falls back to "all".
      if (group && group !== NONE && !r.groups.some((g) => g.id === group)) pick(null);
    });
  }, [selected]);

  function pick(g: string | null) {
    setGroup(g);
    setTag(null);
    store("glossary-group", g ?? "");
  }

  async function save() {
    if (!editing) return;
    const { id, ...body } = editing;
    if (!body.vi.trim() && !body.ja.trim()) return close();
    close();
    if (id) await api("/glossary/" + id, "PUT", body);
    else await api("/glossary", "POST", body);
    load();
  }

  async function remove() {
    if (!editing?.id || !confirm(t("confirmDelete"))) return;
    await api("/glossary/" + editing.id, "DELETE");
    close();
    load();
  }

  function close() {
    setEditing(null);
    if (selected) navigate("/glossary");
  }

  async function addGroup() {
    const name = prompt(t("groupName"))?.trim();
    if (!name) return;
    const { id } = await api<{ id: string }>("/glossary-groups", "POST", { name });
    await load();
    pick(id);
  }

  async function renameGroup(g: Group) {
    const name = prompt(t("groupName"), g.name)?.trim();
    if (!name || name === g.name) return;
    await api("/glossary-groups/" + g.id, "PUT", { name });
    load();
  }

  async function deleteGroup(g: Group) {
    if (!confirm(t("deleteGroup"))) return;
    await api("/glossary-groups/" + g.id, "DELETE");
    pick(null);
    load();
  }

  async function copy(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFlash(text);
      setTimeout(() => setFlash(""), 1200);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  const all = terms ?? [];
  const countOf = (id: string | null) =>
    id === null ? all.length : all.filter((x) => (id === NONE ? !x.group_id : x.group_id === id)).length;
  const inGroup = all.filter((x) => group === null || (group === NONE ? !x.group_id : x.group_id === group));
  const allTags = [...new Set(inGroup.flatMap((x) => tagsOf(x.tags)))].sort();
  const needle = fold(q.trim());
  // Searching looks across every group, so nothing is hidden by the current filter.
  const shown = (needle ? all : inGroup).filter(
    (x) =>
      (!tag || tagsOf(x.tags).includes(tag)) &&
      (!needle || fold([x.vi, x.ja, x.reading, x.en, x.note, x.tags].join(" ")).includes(needle)),
  );
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;
  const current = groups.find((g) => g.id === group);

  const cell = (text: string, cls = "") => (
    <td className={cls}>
      <button className="copy-cell" title={text ? "Copy" : undefined} onClick={() => copy(text)}>
        {text || <span className="muted">—</span>}
        {flash === text && text && <span className="copied">{t("copied")}</span>}
      </button>
    </td>
  );

  return (
    <div className="gl-layout">
      <aside className="gl-groups">
        <div className="tpl-head">
          <strong>{t("groups")}</strong>
          <button className="link-btn" onClick={addGroup}>+ {t("newGroup")}</button>
        </div>
        <button className={"gl-group" + (group === null ? " on" : "")} onClick={() => pick(null)}>
          <span className="grow">{t("allProjects")}</span>
          <span className="count">{countOf(null)}</span>
        </button>
        {groups.map((g) => (
          <button key={g.id} className={"gl-group" + (group === g.id ? " on" : "")} onClick={() => pick(g.id)} onDoubleClick={() => renameGroup(g)} title={g.name}>
            <span className="grow">{g.name}</span>
            <span className="count">{countOf(g.id)}</span>
          </button>
        ))}
        {countOf(NONE) > 0 && (
          <button className={"gl-group" + (group === NONE ? " on" : "")} onClick={() => pick(NONE)}>
            <span className="grow muted">{t("noGroup")}</span>
            <span className="count">{countOf(NONE)}</span>
          </button>
        )}
      </aside>

      <div className="page glossary">
        <header className="page-head">
          <h1>{needle ? t("glossary") : current?.name ?? (group === NONE ? t("noGroup") : t("glossary"))}</h1>
          {current && !needle && (
            <span className="gl-actions">
              <button className="link-btn" onClick={() => renameGroup(current)}>{t("rename")}</button>
              <button className="link-btn" onClick={() => deleteGroup(current)}>{t("del")}</button>
            </span>
          )}
          <input type="search" className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchAllGroups")} aria-label={t("search")} />
          <button className="btn primary" onClick={() => setEditing({ id: null, ...EMPTY, group_id: group && group !== NONE ? group : null, tags: tag ?? "" })}>+ {t("newTerm")}</button>
        </header>

        {allTags.length > 0 && !needle && (
          <div className="chips" style={{ marginBottom: 14 }}>
            <button className={"chip" + (tag === null ? " on" : "")} onClick={() => setTag(null)}>{t("allProjects")}</button>
            {allTags.map((g) => <button key={g} className={"chip" + (tag === g ? " on" : "")} onClick={() => setTag(g)}>{g}</button>)}
          </div>
        )}

        {shown.length > 0 && (
          <div className="table-wrap">
            <table className="term-table">
              <thead>
                <tr>
                  <th>{t("vi")}</th>
                  <th>{t("ja")}</th>
                  <th>{t("reading")}</th>
                  <th>{t("en")}</th>
                  <th>{t("noteField")}</th>
                  <th aria-label={t("edit")} />
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    {cell(x.vi)}
                    {cell(x.ja, "ja")}
                    {cell(x.reading, "muted")}
                    {cell(x.en)}
                    <td className="note-cell">
                      {x.note}
                      {(needle || group === null) && groupName(x.group_id) && <i className="tag grp">{groupName(x.group_id)}</i>}
                      {tagsOf(x.tags).map((g) => <i key={g} className="tag">{g}</i>)}
                    </td>
                    <td><button className="btn" onClick={() => setEditing(x)} aria-label={t("edit")}>✎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {terms && shown.length === 0 && <p className="muted placeholder-box">{all.length ? t("noResults") : t("empty")}</p>}
      </div>

      {editing && (
        <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <form className="modal" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="fields two">
              <label>{t("vi")}<input autoFocus value={editing.vi} onChange={(e) => setEditing({ ...editing, vi: e.target.value })} /></label>
              <label>{t("ja")}<input value={editing.ja} onChange={(e) => setEditing({ ...editing, ja: e.target.value })} /></label>
              <label>{t("reading")}<input value={editing.reading} onChange={(e) => setEditing({ ...editing, reading: e.target.value })} placeholder="ふりがな" /></label>
              <label>{t("en")}<input value={editing.en} onChange={(e) => setEditing({ ...editing, en: e.target.value })} /></label>
            </div>
            <label className="field">{t("group")}
              <select value={editing.group_id ?? ""} onChange={(e) => setEditing({ ...editing, group_id: e.target.value || null })}>
                <option value="">{t("noGroup")}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="field">{t("noteField")}
              <textarea rows={3} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </label>
            <label className="field">{t("tagsPlaceholder")}
              <input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
            </label>
            <div className="modal-foot">
              {editing.id && <button type="button" className="btn danger" onClick={remove}>{t("del")}</button>}
              <span className="grow" />
              <button type="button" className="btn" onClick={close}>{t("close")}</button>
              <button type="submit" className="btn primary">{t("save")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
