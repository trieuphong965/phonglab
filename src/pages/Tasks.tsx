import { useEffect, useState } from "react";
import { api, fmtDate, todayStr, useT, type Project, type Status, type Task } from "../lib";

const COLUMNS: Status[] = ["todo", "doing", "done"];
const COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#6d28d9", "#4d7c0f"];

export default function Tasks() {
  const { t, lang } = useT();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [adding, setAdding] = useState<Status | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);

  const load = async () => {
    const [ts, ps] = await Promise.all([api<Task[]>("/tasks"), api<Project[]>("/projects")]);
    setTasks(ts);
    setProjects(ps);
  };
  useEffect(() => {
    load();
  }, []);

  const projectOf = (id: string | null) => projects.find((p) => p.id === id);
  const visible = tasks.filter((k) => filter === "all" || k.project_id === filter);
  const today = todayStr();

  async function addTask(status: Status) {
    const title = draft.trim();
    setDraft("");
    if (!title) return setAdding(null);
    await api("/tasks", "POST", { title, status, project_id: filter === "all" ? null : filter });
    load();
  }

  async function move(id: string, status: Status) {
    const task = tasks.find((k) => k.id === id);
    if (!task || task.status === status) return;
    const position = Date.now();
    setTasks((all) => all.map((k) => (k.id === id ? { ...k, status, position } : k)).sort((a, b) => a.position - b.position));
    await api("/tasks/" + id, "PUT", { status, position });
  }

  async function saveEdit() {
    if (!editing) return;
    const { id, title, note, due, project_id, status } = editing;
    setEditing(null);
    await api("/tasks/" + id, "PUT", { title, note, due, project_id, status });
    load();
  }

  async function removeTask() {
    if (!editing || !confirm(t("confirmDelete"))) return;
    await api("/tasks/" + editing.id, "DELETE");
    setEditing(null);
    load();
  }

  async function addProject() {
    const name = prompt(t("projectName"))?.trim();
    if (!name) return;
    const { id } = await api<{ id: string }>("/projects", "POST", { name, color: COLORS[projects.length % COLORS.length] });
    await load();
    setFilter(id);
  }

  async function removeProject(id: string) {
    if (!confirm(t("deleteProject"))) return;
    await api("/projects/" + id, "DELETE");
    setFilter("all");
    load();
  }

  return (
    <div className="page tasks">
      <header className="page-head">
        <h1>{t("tasks")}</h1>
        <div className="chips">
          <button className={"chip" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>{t("allProjects")}</button>
          {projects.map((p) => (
            <button key={p.id} className={"chip" + (filter === p.id ? " on" : "")} onClick={() => setFilter(p.id)}>
              <span className="swatch" style={{ background: p.color }} />
              {p.name}
              {filter === p.id && (
                <span className="chip-x" role="button" aria-label={t("del")} onClick={(e) => { e.stopPropagation(); removeProject(p.id); }}>×</span>
              )}
            </button>
          ))}
          <button className="chip ghost" onClick={addProject}>{t("newProject")}</button>
        </div>
      </header>

      <div className="board">
        {COLUMNS.map((col) => {
          const items = visible.filter((k) => k.status === col);
          return (
            <section
              key={col}
              className={"column" + (over === col ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(col); }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) move(dragId, col); setDragId(null); }}
            >
              <h2><span className={"dot " + col} />{t(col)}<span className="count">{items.length}</span></h2>
              <div className="cards">
                {items.map((k) => {
                  const p = projectOf(k.project_id);
                  return (
                    <article
                      key={k.id}
                      className={"card" + (dragId === k.id ? " dragging" : "")}
                      draggable
                      tabIndex={0}
                      onDragStart={(e) => { setDragId(k.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      onClick={() => setEditing(k)}
                      onKeyDown={(e) => e.key === "Enter" && setEditing(k)}
                    >
                      <p>{k.title}</p>
                      {(p || k.due) && (
                        <footer>
                          {p && <span className="proj"><span className="swatch" style={{ background: p.color }} />{p.name}</span>}
                          {k.due && (
                            <span className={"due" + (col !== "done" && k.due < today ? " late" : col !== "done" && k.due === today ? " now" : "")}>
                              {fmtDate(k.due, lang)}
                            </span>
                          )}
                        </footer>
                      )}
                    </article>
                  );
                })}
              </div>
              {adding === col ? (
                <form onSubmit={(e) => { e.preventDefault(); addTask(col); }}>
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => addTask(col).then(() => setAdding(null))} placeholder={t("title")} aria-label={t("title")} />
                </form>
              ) : (
                <button className="add" onClick={() => { setAdding(col); setDraft(""); }}>{t("addTask")}</button>
              )}
            </section>
          );
        })}
      </div>

      {editing && (
        <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && saveEdit()}>
          <div className="modal" role="dialog" aria-modal="true">
            <input className="title-input" autoFocus value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label={t("title")} />
            <div className="fields">
              <label>{t("project")}
                <select value={editing.project_id ?? ""} onChange={(e) => setEditing({ ...editing, project_id: e.target.value || null })}>
                  <option value="">{t("noProject")}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>{t("due")}
                <input type="date" value={editing.due ?? ""} onChange={(e) => setEditing({ ...editing, due: e.target.value || null })} />
              </label>
              <label>Status
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Status })}>
                  {COLUMNS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                </select>
              </label>
            </div>
            <textarea rows={6} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder={t("detail")} aria-label={t("detail")} />
            <div className="modal-foot">
              <button className="btn danger" onClick={removeTask}>{t("del")}</button>
              <span className="grow" />
              <button className="btn primary" onClick={saveEdit}>{t("close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
