// Fills an EMPTY local PhongLab with sample data (used for the README screenshots).
//   npm run dev            (template config, Access check off via .dev.vars)
//   node scripts/demo-data.mjs http://localhost:5173
// Never point this at a site with real data: it only adds, but it adds a lot.
const BASE = (process.argv[2] || "http://localhost:5173").replace(/\/$/, "");

const api = async (path, method = "GET", body) => {
  const res = await fetch(BASE + "/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const TODAY = day(0);
const upload = async (path, name, text, note, date) => {
  const form = new FormData();
  form.append("file", new File([text.padEnd(180_000 + text.length * 997, " ")], name, { type: "application/pdf" }));
  if (note !== undefined) form.append("note", note);
  if (date) form.append("event_date", date);
  const res = await fetch(BASE + "/api" + path, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload ${name}: ${res.status}`);
  return res.json();
};

const existing = await api("/gantt");
if (existing.length) {
  console.error("This site already has schedule data; refusing to add demo data.");
  process.exit(1);
}

await api("/settings", "PUT", { site_name: "PhongLab", owner_name: "Phong", default_lang: "en" });

/* ----- Schedule ----- */
let pos = 1;
const g = (o) => api("/gantt", "POST", { position: pos++, _event_date: day(-12), ...o }).then((r) => r.id);
const design = await g({ title: "Design", start_date: day(-12), end_date: day(-12) });
const schematic = await g({ parent_id: design, title: "Schematic drawings", start_date: day(-12), end_date: day(-6), progress: 100, assignee: "Phong", plan_hours: 16, actual_hours: 14.5 });
const bom = await g({ parent_id: design, title: "BOM & nameplate list", start_date: day(-5), end_date: day(-1), progress: 70, assignee: "Phong", depends_on: schematic, plan_hours: 8, actual_hours: 6 });
const check = await g({ parent_id: design, title: "Drawing check", start_date: day(-4), end_date: day(-2), progress: 40, assignee: "Tanaka", plan_hours: 4, actual_hours: 3 });
const build = await g({ title: "Build", start_date: day(1), end_date: day(1) });
const assembly = await g({ parent_id: build, title: "Panel assembly", start_date: day(1), end_date: day(7), assignee: "Sato", depends_on: bom, plan_hours: 24 });
const wiring = await g({ parent_id: build, title: "Wiring", start_date: day(5), end_date: day(12), assignee: "Sato", depends_on: assembly, plan_hours: 32 });
const plc = await g({ parent_id: build, title: "PLC program", start_date: day(-3), end_date: day(9), progress: 35, assignee: "Phong", plan_hours: 20, actual_hours: 7 });
await g({ title: "Shipping inspection", start_date: day(14), end_date: day(16), assignee: "Tanaka", depends_on: wiring, plan_hours: 6 });

await api(`/gantt/${schematic}/events`, "POST", { body: "Kick-off with the customer. Motor list confirmed: **3 × 3.7 kW** + 1 × 0.75 kW.", event_date: day(-12) });
await upload(`/gantt/${schematic}/files`, "Line3_schematic.pdf", "%PDF-1.4 demo v1", "First issue for approval", day(-8));
await api(`/gantt/${schematic}/events`, "POST", { body: "Customer asked to add an E-stop at the operator side. Sheet 4 updated.", event_date: day(-7) });
await upload(`/gantt/${schematic}/files`, "Line3_schematic.pdf", "%PDF-1.4 demo v2", "Rev B: operator-side E-stop added", day(-6));
await api(`/gantt/${schematic}`, "PUT", { end_date: day(-6), _event_date: day(-7) });
await api(`/gantt/${bom}/events`, "POST", { body: "Waiting for the MCCB delivery date from the supplier.", event_date: day(-1) });
await api(`/gantt/${plc}/events`, "POST", { body: "I/O assignment done. Interlock for conveyor 2 still open.", event_date: TODAY });

/* ----- Notes ----- */
await api("/notes", "POST", {
  title: "Line 3 kick-off meeting",
  tags: "meeting, line3",
  pinned: true,
  content: `# Line 3 kick-off\n\n**Attendees:** Phong, Tanaka, Sato\n\n## Decisions\n- Control voltage **24 V DC**, main **200 V 3φ**\n- PLC: Mitsubishi iQ-R, HMI 10"\n- Delivery: end of next month\n\n## Motors\n| Tag | kW | Start |\n|---|---|---|\n| M1 | 3.7 | Inverter |\n| M2 | 3.7 | Inverter |\n| M3 | 3.7 | Star-delta |\n| M4 | 0.75 | DOL |\n`,
});
await api("/notes", "POST", { title: "Terminal tightening torque", tags: "reference", content: "M3: 0.5–0.6 N·m\nM3.5: 0.8–1.0 N·m\nM4: 1.2–1.5 N·m\nM5: 2.0–2.5 N·m" });
await api("/notes", "POST", { title: "PLC address map", tags: "plc, line3", content: "X0–X1F  Inputs (field)\nY0–Y1F  Outputs\nM0–M99  Sequence steps\nD100–D199  Recipe data" });
await api("/notes", "POST", { title: "Ideas for the next panel", tags: "inbox", content: "Try the new slim terminal blocks to save DIN rail space." });

/* ----- To-do ----- */
const proj = (await api("/projects", "POST", { name: "Line 3", color: "#b45309" })).id;
await api("/tasks", "POST", { title: "Ask supplier for MCCB lead time", status: "doing", project_id: proj, due: TODAY });
await api("/tasks", "POST", { title: "Update nameplate list after Rev B", status: "todo", project_id: proj, due: day(2) });
await api("/tasks", "POST", { title: "Order DIN rail and ducts", status: "todo", project_id: proj, due: day(-1) });
await api("/tasks", "POST", { title: "Send Rev B drawings to customer", status: "done", project_id: proj });
await api("/tasks", "POST", { title: "Renew CAD license", status: "todo", due: day(10) });

/* ----- Checklist ----- */
const tpl = (await api("/checklist-templates", "POST", {
  name: "Shipping inspection",
  items: ["# Visual", "Nameplates match the list", "No paint damage", "Door gaps and locks OK", "# Electrical", "Insulation resistance ≥ 1 MΩ", "Withstand voltage test", "Continuity of earth wiring", "# Function", "E-stop stops all motors", "Interlocks per sequence chart", "Signal tower colours correct"],
})).id;
const cl = (await api("/checklists", "POST", { name: "Line 3 — shipping inspection", template_id: tpl })).id;
const list = (await api("/checklists")).lists.find((l) => l.id === cl);
const items = JSON.parse(list.items).map((it, i) => ({ ...it, done: [1, 2, 3, 5, 7].includes(i), note: i === 5 ? "Measured 50 MΩ at 500 V" : "" }));
await api(`/checklists/${cl}`, "PUT", { items });

/* ----- Journal ----- */
await api(`/journal/${day(-1)}`, "PUT", { content: "- Finished BOM draft (70%)\n- Called supplier about MCCB delivery\n- Reviewed Rev B with Tanaka" });
await api(`/journal/${TODAY}`, "PUT", { content: "- PLC I/O assignment done\n- Conveyor 2 interlock: need to confirm with customer\n- Tomorrow: nameplate list" });

/* ----- Documents ----- */
for (const [name, tags] of [["MCCB catalogue 2026.pdf", "catalogue"], ["Inverter manual.pdf", "manual"], ["Customer spec Line 3.pdf", "line3, spec"]]) {
  const form = new FormData();
  form.append("file", new File(["%PDF-1.4 demo".padEnd(350_000 + name.length * 12_345, " ")], name, { type: "application/pdf" }));
  form.append("tags", tags);
  const res = await fetch(BASE + "/api/docs", { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload ${name}: ${res.status}`);
}

/* ----- Diagram ----- */
let seed = 1;
const base = (o) => ({ angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: seed++, version: 1, versionNonce: seed, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, ...o });
const box = (id, type, x, y, w, h, bg) => base({ id, type, x, y, width: w, height: h, backgroundColor: bg, roundness: type === "rectangle" ? { type: 3 } : { type: 2 } });
const text = (id, x, y, t) => base({ id, type: "text", x, y, width: t.length * 11, height: 25, text: t, originalText: t, fontSize: 20, fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, strokeWidth: 1 });
const arrow = (id, x, y, dx, dy) => base({ id, type: "arrow", x, y, width: Math.abs(dx), height: Math.abs(dy), points: [[0, 0], [dx, dy]], startArrowhead: null, endArrowhead: "arrow", roundness: { type: 2 }, elbowed: false });
const elements = [
  box("s", "ellipse", 300, 20, 200, 70, "#b2f2bb"), text("st", 362, 42, "Start"),
  arrow("a1", 400, 95, 0, 55),
  box("e", "diamond", 290, 155, 220, 120, "#ffec99"), text("et", 338, 202, "E-stop OK?"),
  arrow("a2", 400, 280, 0, 55),
  box("r", "rectangle", 290, 340, 220, 70, "#a5d8ff"), text("rt", 318, 362, "Start conveyor"),
  arrow("a3", 515, 215, 120, 0),
  box("al", "rectangle", 640, 180, 200, 70, "#ffc9c9"), text("alt", 668, 202, "Alarm + stop"),
  text("yes", 410, 292, "Yes"), text("no", 545, 180, "No"),
];
const flow = (await api("/flows", "POST", { title: "Conveyor start sequence" })).id;
await api(`/flows/${flow}`, "PUT", { data: JSON.stringify({ elements, appState: { viewBackgroundColor: "#ffffff" }, files: {} }) });

console.log("Demo data added to", BASE);
