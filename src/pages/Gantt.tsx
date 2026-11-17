import { useEffect, useMemo, useRef, useState } from "react";
import { api, store, stored, todayStr, useT } from "../lib";
import { buildRows, dayDate, fmtHours, fromDay, subtree, toDay, todayDay, type GanttItem, type HistEvent, type Row } from "../gantt";
import GanttHistory from "../GanttHistory";

const EDITABLE = ["title", "start_date", "end_date", "progress", "assignee", "depends_on", "parent_id", "plan_hours", "actual_hours"] as const;
type DropPos = "before" | "after" | "inside";

const ROW = 34;
const SCALES = { day: 24, week: 10, month: 4 } as const;
type Scale = keyof typeof SCALES;
type Drag = { id: string; mode: "move" | "l" | "r"; x0: number; delta: number };

const md = (n: number) => {
  const d = dayDate(n);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

type Activity = {
  item_id: string;
  kind: "comment" | "file";
  event_date: string;
  body: string;
  name: string | null;
  rev: number | null;
};

export default function Gantt({ selected, subTab }: { selected?: string; subTab?: string }) {
  const { t, lang } = useT();
  const [items, setItems] = useState<GanttItem[] | null>(null);
  const [scale, setScale] = useState<Scale>(() => {
    const s = stored("gantt-scale", "day");
    return s in SCALES ? (s as Scale) : "day";
  });
  const [showInfo, setShowInfo] = useState(() => stored("gantt-info", "1") === "1");
  const [editing, setEditing] = useState<GanttItem | null>(null);
  /** The open task as last saved; diffed against `editing` to know what to save. */
  const original = useRef<GanttItem | null>(null);
  const [tab, setTab] = useState<"info" | "history">("info");
  const [histKey, setHistKey] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Row being dragged in the task column, and where it would land. */
  const [rowDrag, setRowDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("textarea, .palette") && open(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  const load = () => api<GanttItem[]>("/gantt").then(setItems);
  const [activity, setActivity] = useState<Activity[]>([]);
  const loadActivity = () => api<Activity[]>("/gantt/activity").then(setActivity);
  useEffect(() => {
    load();
    loadActivity();
  }, []);

  /** Per task: comment/file counts and the events of each day (for the dots on the bars). */
  const acts = useMemo(() => {
    const m = new Map<string, { comments: number; files: number; days: Map<string, string[]> }>();
    for (const a of activity) {
      const e = m.get(a.item_id) ?? { comments: 0, files: 0, days: new Map() };
      if (a.kind === "comment") e.comments++;
      else e.files++;
      const line = a.kind === "comment" ? "💬 " + a.body : `📎 ${a.name ?? "?"} rev${a.rev ?? "?"}${a.body ? " · " + a.body : ""}`;
      e.days.set(a.event_date, [...(e.days.get(a.event_date) ?? []), line]);
      m.set(a.item_id, e);
    }
    return m;
  }, [activity]);

  function openHistory(it: GanttItem) {
    open(it).then(() => setTab("history"));
  }

  // Deep link from search: /gantt/<id> or /gantt/<id>/history opens that task.
  const handled = useRef("");
  useEffect(() => {
    const key = (selected ?? "") + "/" + (subTab ?? "");
    if (!selected || !items || handled.current === key) return;
    handled.current = key;
    const it = items.find((i) => i.id === selected);
    if (!it) return;
    if (subTab === "history") openHistory(it);
    else {
      setTab("info");
      open(it);
    }
    const i = rows.findIndex((r) => r.item.id === selected);
    if (i >= 0 && scroller.current) {
      scroller.current.scrollTop = Math.max(0, i * ROW - 120);
      const r = rows[i];
      scroller.current.scrollLeft = Math.max(0, (r.start - min) * px - 120);
    }
  }, [selected, subTab, items]);

  const px = SCALES[scale];
  const today = todayDay();
  const rows = useMemo(() => buildRows(items ?? []), [items]);

  // Chart range: always covers today, padded so there is room to drag.
  const [min, max] = useMemo(() => {
    let lo = today - 7;
    let hi = today + 45;
    for (const r of rows) {
      lo = Math.min(lo, r.start);
      hi = Math.max(hi, r.end);
    }
    return [lo - 3, hi + 21];
  }, [rows, today]);
  const days = max - min + 1;

  useEffect(() => {
    if (!items || scrolled.current || !scroller.current) return;
    scrolled.current = true;
    scroller.current.scrollLeft = Math.max(0, (today - min) * px - 80);
  }, [items]);

  /* ----- header cells ----- */
  const { months, cells, weekends } = useMemo(() => {
    const months: { label: string; span: number }[] = [];
    const cells: { label: string; span: number; dow: number }[] = [];
    const weekends: { x: number; sun: boolean }[] = [];
    for (let n = min; n <= max; n++) {
      const d = dayDate(n);
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (months.at(-1)?.label === label) months.at(-1)!.span++;
      else months.push({ label, span: 1 });
      const dow = d.getUTCDay();
      if (scale === "day") cells.push({ label: String(d.getUTCDate()), span: 1, dow });
      else if (scale === "week") {
        if (dow === 1 || n === min) cells.push({ label: dow === 1 ? md(n) : "", span: 1, dow: 1 });
        else cells.at(-1)!.span++;
      }
      if (scale !== "month" && (dow === 0 || dow === 6)) weekends.push({ x: n - min, sun: dow === 0 });
    }
    return { months, cells, weekends };
  }, [min, max, scale]);

  /* ----- bar geometry (with the live drag applied) ----- */
  const span = (r: Row) => {
    let { start, end } = r;
    if (drag && drag.id === r.item.id) {
      if (drag.mode === "move") {
        start += drag.delta;
        end += drag.delta;
      } else if (drag.mode === "l") start = Math.min(start + drag.delta, end);
      else end = Math.max(end + drag.delta, start);
    }
    return { start, end, x: (start - min) * px, w: (end - start + 1) * px };
  };
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.item.id, i])), [rows]);

  const arrows = rows.flatMap((r, i) => {
    const dep = r.item.depends_on;
    const pi = dep ? indexOf.get(dep) : undefined;
    if (pi === undefined) return [];
    const a = span(rows[pi]);
    const b = span(r);
    const x1 = a.x + a.w;
    const y1 = pi * ROW + ROW / 2;
    const x2 = b.x;
    const y2 = i * ROW + ROW / 2;
    const d =
      x2 >= x1 + 14
        ? `M${x1} ${y1} H${x1 + 7} V${y2} H${x2 - 2}`
        : `M${x1} ${y1} H${x1 + 7} V${y2 + (y2 > y1 ? -1 : 1) * (ROW / 2)} H${x2 - 10} V${y2} H${x2 - 2}`;
    return [<path key={r.item.id} d={d} markerEnd="url(#g-arrow)" />];
  });

  /* ----- mutations ----- */
  async function patch(id: string, body: Partial<GanttItem>) {
    setItems((all) => all && all.map((it) => (it.id === id ? { ...it, ...body } : it)));
    // Keep the open panel in step, so a later save never reverts e.g. a drag.
    setEditing((e) => (e && e.id === id ? { ...e, ...body } : e));
    if (original.current?.id === id) original.current = { ...original.current, ...body };
    await api("/gantt/" + id, "PUT", { ...body, _event_date: todayStr() });
    setHistKey((k) => k + 1);
  }

  /** Save edits made in the Info tab, if any. */
  async function commit() {
    const e = editing;
    const o = original.current;
    if (!e || !o || e.id !== o.id) return;
    const next: GanttItem = {
      ...e,
      end_date: e.end_date < e.start_date ? e.start_date : e.end_date,
      progress: Math.min(100, Math.max(0, Math.round(e.progress) || 0)),
    };
    const body: Record<string, unknown> = {};
    for (const f of EDITABLE) if (next[f] !== o[f]) body[f] = next[f];
    if (Object.keys(body).length) await patch(e.id, body as Partial<GanttItem>);
  }

  /** Open a task in the side panel (saving the one that was open), or close it with null. */
  async function open(it: GanttItem | null) {
    await commit();
    original.current = it;
    setEditing(it);
    if (!it && location.pathname !== "/gantt") {
      // Leave the deep link, so opening the same search result again works.
      handled.current = "";
      history.replaceState(null, "", "/gantt");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  async function add(parent: GanttItem | null) {
    const start = parent ? toDay(parent.start_date) : today;
    const body = {
      parent_id: parent?.id ?? null,
      title: t("newTask"),
      start_date: fromDay(start),
      end_date: fromDay(start + 2),
      position: Date.now(),
    };
    const { id } = await api<{ id: string }>("/gantt", "POST", { ...body, _event_date: todayStr() });
    if (parent?.collapsed) await api("/gantt/" + parent.id, "PUT", { collapsed: 0 });
    await load();
    setTab("info");
    await open({ ...body, id, progress: 0, assignee: "", depends_on: null, collapsed: 0, plan_hours: null, actual_hours: null });
  }

  async function remove(it: GanttItem) {
    if (!confirm(t("confirmDeleteTask"))) return;
    if (editing?.id === it.id) {
      original.current = null;
      setEditing(null);
    }
    await api("/gantt/" + it.id, "DELETE");
    load();
  }

  /** Drop row `id` before/after `targetId` (as its sibling) or inside it (as its last child). */
  async function moveRow(id: string, targetId: string, pos: DropPos) {
    if (!items || id === targetId) return;
    const target = items.find((i) => i.id === targetId);
    if (!target || subtree(items, id).has(targetId)) return;
    const parent = pos === "inside" ? target.id : target.parent_id;
    const sibs = items
      .filter((i) => (i.parent_id ?? null) === (parent ?? null) && i.id !== id)
      .sort((a, b) => a.position - b.position);
    let position: number;
    if (pos === "inside") position = sibs.length ? sibs[sibs.length - 1].position + 1 : 1;
    else {
      const k = sibs.findIndex((i) => i.id === target.id);
      const near = sibs[pos === "before" ? k - 1 : k + 1];
      position = near ? (near.position + target.position) / 2 : target.position + (pos === "before" ? -1 : 1);
    }
    const body: Partial<GanttItem> = { position };
    const mover = items.find((i) => i.id === id)!;
    if ((mover.parent_id ?? null) !== (parent ?? null)) body.parent_id = parent;
    if (pos === "inside" && target.collapsed) await patch(target.id, { collapsed: 0 });
    await patch(id, body);
  }

  function endDrag(r: Row) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.delta === 0) {
      if (d.mode === "move") open(r.item);
      return;
    }
    const s = span(r);
    patch(r.item.id, { start_date: fromDay(s.start), end_date: fromDay(s.end) });
  }

  async function download() {
    if (!items) return;
    setBusy(true);
    try {
      await commit();
      const [{ exportGanttExcel }, events] = await Promise.all([
        import("../ganttExcel"),
        api<HistEvent[]>("/gantt/history"),
      ]);
      await exportGanttExcel(items, lang, events);
    } finally {
      setBusy(false);
    }
  }

  const setScaleStored = (s: Scale) => {
    setScale(s);
    store("gantt-scale", s);
  };

  const editingIsGroup = !!editing && !!items?.some((i) => i.parent_id === editing.id);
  const blocked = editing && items ? subtree(items, editing.id) : new Set<string>();

  return (
    <div className="gantt-page">
      <header className="gantt-bar">
        <h1>{t("gantt")}</h1>
        <button className="btn primary" onClick={() => add(null)}>+ {t("newItem")}</button>
        <button className="btn" onClick={download} disabled={busy || !items?.length}>
          {busy ? t("loading") : "⬇ Excel"}
        </button>
        <span className="grow" />
        <label className="check">
          <input type="checkbox" checked={showInfo} onChange={(e) => { setShowInfo(e.target.checked); store("gantt-info", e.target.checked ? "1" : "0"); }} />
          {t("showInfo")}
        </label>
        <div className="seg">
          {(Object.keys(SCALES) as Scale[]).map((s) => (
            <button key={s} className={scale === s ? "on" : ""} onClick={() => setScaleStored(s)}>{t(s)}</button>
          ))}
        </div>
      </header>

      <div className="gantt" ref={scroller}>
        <div className="g-inner" style={{ width: `calc(var(--g-left) + ${days * px}px)` }}>
          <div className="g-left">
            <div className="g-head g-corner">{t("task")}</div>
            {rows.map((r) => (
              <div
                key={r.item.id}
                className={
                  "g-row" + (r.isGroup ? " group" : "") + (rowDrag === r.item.id ? " dragging" : "") +
                  (drop?.id === r.item.id ? " drop-" + drop.pos : "")
                }
                style={{ paddingLeft: 8 + r.depth * 16 }}
                draggable
                onDragStart={(e) => {
                  setRowDrag(r.item.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", r.item.title);
                }}
                onDragEnd={() => { setRowDrag(null); setDrop(null); }}
                onDragOver={(e) => {
                  if (!rowDrag || !items || subtree(items, rowDrag).has(r.item.id)) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  const y = (e.clientY - box.top) / box.height;
                  const pos: DropPos = y < 0.3 ? "before" : y > 0.7 ? "after" : "inside";
                  if (drop?.id !== r.item.id || drop.pos !== pos) setDrop({ id: r.item.id, pos });
                }}
                onDragLeave={(e) => e.currentTarget === e.target && setDrop((d) => (d?.id === r.item.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (rowDrag && drop) moveRow(rowDrag, drop.id, drop.pos);
                  setRowDrag(null);
                  setDrop(null);
                }}
              >
                {r.isGroup ? (
                  <button className="g-toggle" aria-label="toggle" onClick={() => patch(r.item.id, { collapsed: r.item.collapsed ? 0 : 1 })}>
                    {r.item.collapsed ? "▸" : "▾"}
                  </button>
                ) : (
                  <span className="g-toggle" />
                )}
                <button className="g-title" title={r.item.title} onClick={() => open(r.item)}>{r.item.title || t("untitled")}</button>
                {acts.has(r.item.id) && (
                  <button className="g-badges" title={t("history")} aria-label={t("history")} onClick={() => openHistory(r.item)}>
                    {acts.get(r.item.id)!.comments > 0 && <span>💬{acts.get(r.item.id)!.comments}</span>}
                    {acts.get(r.item.id)!.files > 0 && <span>📎{acts.get(r.item.id)!.files}</span>}
                  </button>
                )}
                <span className="g-actions">
                  <button title={t("edit")} aria-label={t("edit")} onClick={() => open(r.item)}>✎</button>
                  <button title={t("addChild")} aria-label={t("addChild")} onClick={() => add(r.item)}>＋</button>
                  <button title={t("del")} aria-label={t("del")} onClick={() => remove(r.item)}>×</button>
                </span>
              </div>
            ))}
            {items && rows.length === 0 && <p className="muted pad">{t("empty")}</p>}
          </div>

          <div className="g-right" style={{ width: days * px }}>
            <div className="g-head">
              <div className="g-months">
                {months.map((m) => <span key={m.label} style={{ width: m.span * px }}>{m.span * px > 60 && <b>{m.label}</b>}</span>)}
              </div>
              <div className="g-days">
                {cells.map((c, i) => (
                  <span key={i} className={c.dow === 0 ? "sun" : c.dow === 6 ? "sat" : ""} style={{ width: c.span * px }}>{c.label}</span>
                ))}
              </div>
            </div>
            <div className="g-body" style={{ height: Math.max(rows.length, 1) * ROW, backgroundSize: `100% ${ROW}px` }}>
              {weekends.map((w) => <i key={w.x} className={"g-we" + (w.sun ? " sun" : "")} style={{ left: w.x * px, width: px }} />)}
              <i className="g-today" style={{ left: (today - min) * px + px / 2 }} />
              <svg className="g-arrows" width={days * px} height={rows.length * ROW}>
                <defs>
                  <marker id="g-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 8 4 0 8z" />
                  </marker>
                </defs>
                {arrows}
              </svg>
              {rows.map((r, i) => {
                const s = span(r);
                const late = !r.isGroup && s.end < today && r.progress < 100;
                return (
                  <div key={r.item.id} className="g-line" style={{ top: i * ROW, left: s.x }}>
                    <div
                      className={"g-bar" + (r.isGroup ? " group" : "") + (late ? " late" : "") + (drag?.id === r.item.id ? " dragging" : "")}
                      style={{ width: s.w }}
                      onPointerDown={(e) => {
                        if (r.isGroup) return void open(r.item);
                        try {
                          e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                          /* pointer already gone: drag still works while over the bar */
                        }
                        const mode = (e.target as HTMLElement).dataset.h as "l" | "r" | undefined;
                        setDrag({ id: r.item.id, mode: mode ?? "move", x0: e.clientX, delta: 0 });
                      }}
                      onPointerMove={(e) => drag && drag.id === r.item.id && setDrag({ ...drag, delta: Math.round((e.clientX - drag.x0) / px) })}
                      onPointerUp={() => endDrag(r)}
                      onPointerCancel={() => setDrag(null)}
                    >
                      <span className="g-fill" style={{ width: r.progress + "%" }} />
                      {s.w >= 36 && <span className="g-pct">{r.progress}%</span>}
                      {!r.isGroup && s.w >= 16 && <><span className="g-h l" data-h="l" /><span className="g-h r" data-h="r" /></>}
                    </div>
                    {[...(acts.get(r.item.id)?.days ?? [])].map(([d, lines]) => (
                      <button
                        key={d}
                        className={"g-dot" + (lines.some((l) => l.startsWith("📎")) ? " file" : "")}
                        style={{ left: (toDay(d) - s.start) * px + px / 2 - 4 }}
                        title={`${d}\n${lines.join("\n")}`}
                        aria-label={`${t("history")} ${d}`}
                        onClick={() => openHistory(r.item)}
                      />
                    ))}
                    {showInfo && (
                      <span className="g-info">
                        {r.item.title} [{md(s.start)}-{md(s.end)}]{r.item.assignee ? " · " + r.item.assignee : ""}
                        {(r.plan !== null || r.actual !== null) && (
                          <b className={"g-hours" + (r.plan !== null && r.actual !== null && r.actual > r.plan ? " over" : "")}>
                            {" "}{fmtHours(r.actual) || "–"} / {fmtHours(r.plan) || "–"}
                          </b>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <aside className="drawer" role="dialog" aria-label={editing.title || t("untitled")}>
          <header className="drawer-head">
            <input className="title-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && commit()} aria-label={t("title")} placeholder={t("title")} />
            <button className="icon-btn" onClick={() => open(null)} aria-label={t("close")} title={t("close")}>×</button>
          </header>
          <div className="seg drawer-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "info"} className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>{t("info")}</button>
            <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "on" : ""} onClick={() => commit().then(() => setTab("history"))}>{t("history")}</button>
          </div>
          {tab === "info" ? (
            <div className="drawer-body">
              {editingIsGroup && <p className="muted small">{t("groupHint")}</p>}
              <div className="fields">
                <label>{t("start")}
                  <input type="date" disabled={editingIsGroup} value={editing.start_date} onChange={(e) => e.target.value && setEditing({ ...editing, start_date: e.target.value })} />
                </label>
                <label>{t("end")}
                  <input type="date" disabled={editingIsGroup} value={editing.end_date} min={editing.start_date} onChange={(e) => e.target.value && setEditing({ ...editing, end_date: e.target.value })} />
                </label>
                <label>{t("progress")} (%)
                  <input type="number" min={0} max={100} step={10} disabled={editingIsGroup} value={editing.progress} onChange={(e) => setEditing({ ...editing, progress: Number(e.target.value) })} />
                </label>
                <label>{t("assignee")}
                  <input value={editing.assignee} onChange={(e) => setEditing({ ...editing, assignee: e.target.value })} />
                </label>
                <label>{t("planHours")}
                  <input type="number" min={0} step={0.5} disabled={editingIsGroup} value={editing.plan_hours ?? ""} onChange={(e) => setEditing({ ...editing, plan_hours: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label>{t("actualHours")}
                  <input type="number" min={0} step={0.5} disabled={editingIsGroup} value={editing.actual_hours ?? ""} onChange={(e) => setEditing({ ...editing, actual_hours: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label>{t("dependsOn")}
                  <select value={editing.depends_on ?? ""} onChange={(e) => setEditing({ ...editing, depends_on: e.target.value || null })}>
                    <option value="">—</option>
                    {items?.filter((i) => !blocked.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.title || t("untitled")}</option>)}
                  </select>
                </label>
                <label>{t("parent")}
                  <select value={editing.parent_id ?? ""} onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}>
                    <option value="">—</option>
                    {items?.filter((i) => !blocked.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.title || t("untitled")}</option>)}
                  </select>
                </label>
              </div>
              <div className="modal-foot">
                <button className="btn danger" onClick={() => remove(editing)}>{t("del")}</button>
                <span className="grow" />
                <button className="btn primary" onClick={() => commit()}>{t("save")}</button>
              </div>
            </div>
          ) : (
            <GanttHistory key={editing.id} itemId={editing.id} refresh={histKey} onChanged={loadActivity} />
          )}
        </aside>
      )}
    </div>
  );
}
