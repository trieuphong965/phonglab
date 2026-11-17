export type GanttItem = {
  id: string;
  parent_id: string | null;
  title: string;
  start_date: string;
  end_date: string;
  progress: number;
  assignee: string;
  depends_on: string | null;
  position: number;
  collapsed: number;
  plan_hours: number | null;
  actual_hours: number | null;
};

/** One visible line of the chart. Groups carry dates/progress rolled up from their children. */
export type Row = {
  item: GanttItem;
  depth: number;
  isGroup: boolean;
  start: number;
  end: number;
  progress: number;
  /** planned / actual hours; groups sum their children; null when nothing is entered */
  plan: number | null;
  actual: number | null;
};

const DAY = 864e5;

/** 'YYYY-MM-DD' -> whole days since epoch (UTC, so no timezone drift) */
export const toDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
export const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const dayDate = (n: number) => new Date(n * DAY);
export const todayDay = () => {
  const d = new Date();
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

export function buildRows(items: GanttItem[], expandAll = false): Row[] {
  const ids = new Set(items.map((i) => i.id));
  const kids = new Map<string | null, GanttItem[]>();
  for (const it of [...items].sort((a, b) => a.position - b.position)) {
    const p = it.parent_id && ids.has(it.parent_id) ? it.parent_id : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(it);
  }

  const rows: Row[] = [];
  const walk = (it: GanttItem, depth: number, visible: boolean) => {
    const children = kids.get(it.id) ?? [];
    const row: Row = { item: it, depth, isGroup: children.length > 0, start: 0, end: 0, progress: 0, plan: null, actual: null };
    if (visible) rows.push(row);

    let start = toDay(it.start_date);
    let end = Math.max(start, toDay(it.end_date));
    let total = end - start + 1;
    let done = (total * it.progress) / 100;
    let plan: number | null = it.plan_hours ?? null;
    let actual: number | null = it.actual_hours ?? null;
    const add = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);

    if (children.length) {
      start = Infinity;
      end = -Infinity;
      total = 0;
      done = 0;
      plan = null;
      actual = null;
      for (const ch of children) {
        const r = walk(ch, depth + 1, visible && (expandAll || !it.collapsed));
        start = Math.min(start, r.start);
        end = Math.max(end, r.end);
        total += r.total;
        done += r.done;
        plan = add(plan, r.plan);
        actual = add(actual, r.actual);
      }
    }
    row.start = start;
    row.end = end;
    row.progress = total ? Math.round((done / total) * 100) : 0;
    row.plan = plan;
    row.actual = actual;
    return { start, end, total, done, plan, actual };
  };
  for (const root of kids.get(null) ?? []) walk(root, 0, true);
  return rows;
}

/** ids of `id` and everything nested under it */
export function subtree(items: GanttItem[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const it of items)
      if (it.parent_id && out.has(it.parent_id) && !out.has(it.id)) {
        out.add(it.id);
        grew = true;
      }
  }
  return out;
}

/** i18n key for each field recorded in a task's change history. */
export type FieldKey = "title" | "start" | "end" | "progress" | "assignee" | "dependsOn" | "parent" | "planHours" | "actualHours";
export const FIELD_KEYS: Record<string, FieldKey> = {
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

/** 12.5 -> "12.5h", null -> "" */
export const fmtHours = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : `${Math.round(n * 100) / 100}h`;

export type HistEvent = {
  item_id: string;
  kind: "comment" | "file" | "change";
  event_date: string;
  body: string;
  created_at: string;
  name: string | null;
  rev: number | null;
};

/** A change record as text lines, e.g. "Assignee: Sato → Tanaka". */
export function describeChange(body: string, label: (k: FieldKey | "created") => string) {
  let list: { field: string; from?: unknown; to?: unknown }[] = [];
  try {
    list = JSON.parse(body);
  } catch {
    return [];
  }
  const val = (f: string, v: unknown) => (v === null || v === undefined || v === "" ? "—" : f === "progress" ? `${v}%` : f.endsWith("_hours") ? `${v}h` : String(v));
  return list.map((ch) =>
    ch.field === "created"
      ? label("created")
      : `${FIELD_KEYS[ch.field] ? label(FIELD_KEYS[ch.field]) : ch.field}: ${val(ch.field, ch.from)} → ${val(ch.field, ch.to)}`,
  );
}
