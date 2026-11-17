import { Hono } from "hono";

type Env = {
  DB: D1Database;
  /** R2 bucket for uploaded documents; absent until R2 is enabled on the account. */
  FILES?: R2Bucket;
  /** "true" in production: every API call must carry a valid Cloudflare Access token. */
  REQUIRE_ACCESS?: string;
  /** e.g. "myteam.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application */
  ACCESS_AUD?: string;
};

const app = new Hono<{ Bindings: Env }>().basePath("/api");

/* ---------- Cloudflare Access guard ---------- */

type Jwk = JsonWebKey & { kid: string };
let certs: { team: string; keys: Jwk[]; at: number } | null = null;

const b64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

async function verifyAccess(token: string, team: string, aud: string): Promise<boolean> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return false;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  if (header.alg !== "RS256") return false;
  const auds: unknown[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return false;
  if (payload.iss !== `https://${team}`) return false;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return false;

  if (!certs || certs.team !== team || Date.now() - certs.at > 3600_000) {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!res.ok) return false;
    certs = { team, keys: ((await res.json()) as { keys: Jwk[] }).keys, at: Date.now() };
  }
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
}

// Fail closed: with REQUIRE_ACCESS on, a missing or wrong Access setup blocks everything.
app.use("*", async (c, next) => {
  if (c.env.REQUIRE_ACCESS !== "true") return next();
  const team = c.env.ACCESS_TEAM_DOMAIN;
  const aud = c.env.ACCESS_AUD;
  if (!team || !aud) return c.json({ error: "Cloudflare Access is not configured" }, 503);
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const ok = token ? await verifyAccess(token, team, aud).catch(() => false) : false;
  if (!ok) return c.json({ error: "unauthorized" }, 401);
  return next();
});

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
/** undefined -> null so COALESCE keeps the stored value */
const opt = (v: unknown) => (v === undefined ? null : v);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

/* ---------- Notes ---------- */

app.get("/notes", async (c) => {
  const q = c.req.query("q")?.trim();
  const base =
    "SELECT id, title, substr(content, 1, 160) AS excerpt, tags, pinned, updated_at FROM notes";
  const order = " ORDER BY pinned DESC, updated_at DESC LIMIT 500";
  const stmt = q
    ? c.env.DB.prepare(
        base + " WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1" + order,
      ).bind(`%${q}%`)
    : c.env.DB.prepare(base + order);
  const { results } = await stmt.all();
  return c.json(results);
});

app.get("/notes/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(c.req.param("id"))
    .first();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.post("/notes", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = uid();
  const t = now();
  await c.env.DB.prepare(
    "INSERT INTO notes (id, title, content, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, b.title ?? "", b.content ?? "", b.tags ?? "", b.pinned ? 1 : 0, t, t)
    .run();
  return c.json({ id, updated_at: t }, 201);
});

app.put("/notes/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const t = now();
  await c.env.DB.prepare(
    `UPDATE notes SET title = COALESCE(?, title), content = COALESCE(?, content),
       tags = COALESCE(?, tags), pinned = COALESCE(?, pinned), updated_at = ? WHERE id = ?`,
  )
    .bind(
      opt(b.title),
      opt(b.content),
      opt(b.tags),
      b.pinned === undefined ? null : b.pinned ? 1 : 0,
      t,
      c.req.param("id"),
    )
    .run();
  return c.json({ ok: true, updated_at: t });
});

app.delete("/notes/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------- Projects ---------- */

app.get("/projects", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM projects ORDER BY created_at").all();
  return c.json(results);
});

app.post("/projects", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = uid();
  await c.env.DB.prepare("INSERT INTO projects (id, name, color, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, b.name ?? "", b.color ?? "#0f766e", now())
    .run();
  return c.json({ id }, 201);
});

app.delete("/projects/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE tasks SET project_id = NULL WHERE project_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

/* ---------- Tasks ---------- */

app.get("/tasks", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM tasks ORDER BY position").all();
  return c.json(results);
});

app.post("/tasks", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = uid();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO tasks (id, project_id, title, note, status, due, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      b.project_id ?? null,
      b.title ?? "",
      b.note ?? "",
      b.status ?? "todo",
      b.due || null,
      b.position ?? Date.now(),
      t,
      t,
    )
    .run();
  return c.json({ id }, 201);
});

app.put("/tasks/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = c.req.param("id");
  const stmts = [
    c.env.DB.prepare(
      `UPDATE tasks SET title = COALESCE(?, title), note = COALESCE(?, note),
         status = COALESCE(?, status), position = COALESCE(?, position), updated_at = ? WHERE id = ?`,
    ).bind(opt(b.title), opt(b.note), opt(b.status), opt(b.position), now(), id),
  ];
  // These two can legitimately be set back to NULL, so COALESCE does not fit.
  if ("due" in b)
    stmts.push(c.env.DB.prepare("UPDATE tasks SET due = ? WHERE id = ?").bind(b.due || null, id));
  if ("project_id" in b)
    stmts.push(
      c.env.DB.prepare("UPDATE tasks SET project_id = ? WHERE id = ?").bind(
        b.project_id || null,
        id,
      ),
    );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.delete("/tasks/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------- Gantt ---------- */

/** Fields whose changes are written to a task's history. */
const LOGGED = ["title", "start_date", "end_date", "progress", "assignee", "depends_on", "parent_id", "plan_hours", "actual_hours"] as const;
const LINKS = new Set(["depends_on", "parent_id"]);
/** Fields that may be cleared back to NULL (so they are set explicitly, not via COALESCE). */
const NULLABLE = new Set(["depends_on", "parent_id", "plan_hours", "actual_hours"]);
/** "" / null / junk -> null, otherwise a non-negative number of hours */
const hours = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
/** The client sends its local "today", so history dates follow the user's timezone. */
const eventDate = (v: unknown) => (isDate(v) ? v : now().slice(0, 10));
/** CTE yielding ?1 and every item nested under it. */
const SUBTREE = `WITH RECURSIVE d(id) AS (
  SELECT ?1 UNION ALL SELECT g.id FROM gantt_items g JOIN d ON g.parent_id = d.id
)`;

function logStmt(db: D1Database, itemId: string, kind: string, date: string, body: string, fileId: string | null = null) {
  return db
    .prepare(
      "INSERT INTO gantt_events (id, item_id, kind, event_date, body, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uid(), itemId, kind, date, body, fileId, now());
}

/** Known-safe types render in the browser; everything else downloads. */
function fileResponse(obj: R2ObjectBody, name: string, type: string, download: boolean) {
  const inline = !download && /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp)|text\/plain)$/.test(type);
  return new Response(obj.body, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Length": String(obj.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

app.get("/gantt", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM gantt_items ORDER BY position").all();
  return c.json(results);
});

app.post("/gantt", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const db = c.env.DB;
  const id = uid();
  const t = now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO gantt_items (id, parent_id, title, start_date, end_date, progress, assignee, depends_on, position, plan_hours, actual_hours, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        b.parent_id || null,
        b.title ?? "",
        b.start_date,
        b.end_date,
        b.progress ?? 0,
        b.assignee ?? "",
        b.depends_on || null,
        b.position ?? Date.now(),
        hours(b.plan_hours),
        hours(b.actual_hours),
        t,
        t,
      ),
    logStmt(db, id, "change", eventDate(b._event_date), JSON.stringify([{ field: "created" }])),
  ]);
  return c.json({ id }, 201);
});

app.put("/gantt/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = c.req.param("id");
  const db = c.env.DB;
  const old = await db.prepare("SELECT * FROM gantt_items WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return c.json({ error: "not found" }, 404);

  const stmts = [
    db
      .prepare(
        `UPDATE gantt_items SET title = COALESCE(?, title), start_date = COALESCE(?, start_date),
           end_date = COALESCE(?, end_date), progress = COALESCE(?, progress), assignee = COALESCE(?, assignee),
           position = COALESCE(?, position), collapsed = COALESCE(?, collapsed), updated_at = ? WHERE id = ?`,
      )
      .bind(
        opt(b.title),
        opt(b.start_date),
        opt(b.end_date),
        opt(b.progress),
        opt(b.assignee),
        opt(b.position),
        b.collapsed === undefined ? null : b.collapsed ? 1 : 0,
        now(),
        id,
      ),
  ];
  // Nullable links: set explicitly when the key is present.
  if ("depends_on" in b)
    stmts.push(db.prepare("UPDATE gantt_items SET depends_on = ? WHERE id = ?").bind(b.depends_on || null, id));
  if ("parent_id" in b)
    stmts.push(db.prepare("UPDATE gantt_items SET parent_id = ? WHERE id = ?").bind(b.parent_id || null, id));
  if ("plan_hours" in b)
    stmts.push(db.prepare("UPDATE gantt_items SET plan_hours = ? WHERE id = ?").bind(hours(b.plan_hours), id));
  if ("actual_hours" in b)
    stmts.push(db.prepare("UPDATE gantt_items SET actual_hours = ? WHERE id = ?").bind(hours(b.actual_hours), id));

  // Record what actually changed (null/'' count as "empty"; null means "keep" for non-link fields).
  const norm = (f: string, v: unknown) =>
    f.endsWith("_hours")
      ? hours(v)
      : v === undefined || v === null || v === "" ? (f === "progress" ? 0 : null) : f === "progress" ? Number(v) : v;
  const changes: { field: string; from: unknown; to: unknown }[] = LOGGED.filter(
    (f) => f in b && b[f] !== undefined && (b[f] !== null || NULLABLE.has(f)),
  )
    .map((f) => ({ field: f as string, from: norm(f, old[f]), to: norm(f, b[f]) }))
    .filter((ch) => ch.from !== ch.to);

  // Store titles rather than ids for links, so history stays readable after deletes.
  const linkIds = changes
    .filter((ch) => LINKS.has(ch.field))
    .flatMap((ch) => [ch.from, ch.to])
    .filter((v): v is string => typeof v === "string");
  if (linkIds.length) {
    const { results } = await db
      .prepare(`SELECT id, title FROM gantt_items WHERE id IN (${linkIds.map(() => "?").join(",")})`)
      .bind(...linkIds)
      .all<{ id: string; title: string }>();
    const names = new Map(results.map((r) => [r.id, r.title]));
    for (const ch of changes)
      if (LINKS.has(ch.field)) {
        ch.from = ch.from ? names.get(ch.from as string) ?? "?" : null;
        ch.to = ch.to ? names.get(ch.to as string) ?? "?" : null;
      }
  }
  if (changes.length) stmts.push(logStmt(db, id, "change", eventDate(b._event_date), JSON.stringify(changes)));

  await db.batch(stmts);
  return c.json({ ok: true });
});

app.delete("/gantt/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  // Remove the item, everything nested under it, and their history and files.
  const { results: files } = await db
    .prepare(`${SUBTREE} SELECT id FROM gantt_files WHERE item_id IN (SELECT id FROM d)`)
    .bind(id)
    .all<{ id: string }>();
  const keys = files.map((f) => "gantt/" + f.id);
  for (let i = 0; c.env.FILES && i < keys.length; i += 1000) await c.env.FILES.delete(keys.slice(i, i + 1000));
  await db.batch([
    db.prepare(`${SUBTREE} DELETE FROM gantt_events WHERE item_id IN (SELECT id FROM d)`).bind(id),
    db.prepare(`${SUBTREE} DELETE FROM gantt_files WHERE item_id IN (SELECT id FROM d)`).bind(id),
    db.prepare(`${SUBTREE} DELETE FROM gantt_items WHERE id IN (SELECT id FROM d)`).bind(id),
    db.prepare(
      "UPDATE gantt_items SET depends_on = NULL WHERE depends_on IS NOT NULL AND depends_on NOT IN (SELECT id FROM gantt_items)",
    ),
  ]);
  return c.json({ ok: true });
});

/* ----- Task history ----- */

/** Comments and uploads across all tasks: drives the counters and the dots on the bars. */
app.get("/gantt/activity", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.item_id, e.kind, e.event_date, substr(e.body, 1, 140) AS body, f.name, f.rev
       FROM gantt_events e LEFT JOIN gantt_files f ON f.id = e.file_id
      WHERE e.kind IN ('comment', 'file') ORDER BY e.event_date, e.created_at`,
  ).all();
  return c.json(results);
});

/** Every task's full history, for the 変更履歴 sheet of the Excel export. */
app.get("/gantt/history", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.item_id, e.kind, e.event_date, e.body, e.created_at, f.name, f.rev
       FROM gantt_events e LEFT JOIN gantt_files f ON f.id = e.file_id
      ORDER BY e.event_date, e.created_at`,
  ).all();
  return c.json(results);
});

/** Attach a file already in Documents: copied, so either side can be deleted independently. */
app.post("/gantt/:id/files/from-doc", async (c) => {
  if (!c.env.FILES) return c.json({ error: "file storage is not enabled" }, 501);
  const id = c.req.param("id");
  const b = await c.req.json<{ doc_id?: string; note?: string; event_date?: string }>();
  const db = c.env.DB;
  const [item, doc] = await Promise.all([
    db.prepare("SELECT 1 FROM gantt_items WHERE id = ?").bind(id).first(),
    db.prepare("SELECT id, name, type FROM docs WHERE id = ?").bind(b.doc_id ?? "").first<{ id: string; name: string; type: string }>(),
  ]);
  if (!item || !doc) return c.json({ error: "not found" }, 404);
  const obj = await c.env.FILES.get(doc.id);
  if (!obj) return c.json({ error: "file missing" }, 404);

  const prev = await db
    .prepare("SELECT MAX(rev) AS r FROM gantt_files WHERE item_id = ? AND name = ?")
    .bind(id, doc.name)
    .first<{ r: number | null }>();
  const rev = (prev?.r ?? 0) + 1;
  const fid = uid();
  // Stream the copy (R2 needs a known length) instead of buffering a large file in memory.
  const { readable, writable } = new FixedLengthStream(obj.size);
  await Promise.all([
    obj.body.pipeTo(writable),
    c.env.FILES.put("gantt/" + fid, readable, {
      httpMetadata: { contentType: doc.type || "application/octet-stream" },
    }),
  ]);
  await db.batch([
    db
      .prepare("INSERT INTO gantt_files (id, item_id, name, rev, size, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(fid, id, doc.name, rev, obj.size, doc.type || "", now()),
    logStmt(db, id, "file", eventDate(b.event_date), (b.note ?? "").trim(), fid),
  ]);
  return c.json({ id: fid, rev }, 201);
});

app.get("/gantt/:id/events", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [events, files] = await db.batch([
    db.prepare("SELECT * FROM gantt_events WHERE item_id = ? ORDER BY event_date DESC, created_at DESC").bind(id),
    db.prepare("SELECT * FROM gantt_files WHERE item_id = ? ORDER BY name, rev DESC").bind(id),
  ]);
  return c.json({ storage: !!c.env.FILES, events: events.results, files: files.results });
});

app.post("/gantt/:id/events", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ body?: string; event_date?: string }>();
  const text = b.body?.trim();
  if (!text) return c.json({ error: "body is required" }, 400);
  const exists = await c.env.DB.prepare("SELECT 1 FROM gantt_items WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "not found" }, 404);
  await logStmt(c.env.DB, id, "comment", eventDate(b.event_date), text).run();
  return c.json({ ok: true }, 201);
});

/** Only comments can be deleted; change records are the audit trail. */
app.delete("/gantt/events/:eid", async (c) => {
  await c.env.DB.prepare("DELETE FROM gantt_events WHERE id = ? AND kind = 'comment'").bind(c.req.param("eid")).run();
  return c.json({ ok: true });
});

app.post("/gantt/:id/files", async (c) => {
  if (!c.env.FILES) return c.json({ error: "file storage is not enabled" }, 501);
  const id = c.req.param("id");
  const db = c.env.DB;
  const exists = await db.prepare("SELECT 1 FROM gantt_items WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "not found" }, 404);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);

  const prev = await db
    .prepare("SELECT MAX(rev) AS r FROM gantt_files WHERE item_id = ? AND name = ?")
    .bind(id, file.name)
    .first<{ r: number | null }>();
  const rev = (prev?.r ?? 0) + 1;
  const fid = uid();
  await c.env.FILES.put("gantt/" + fid, file, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await db.batch([
    db
      .prepare("INSERT INTO gantt_files (id, item_id, name, rev, size, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(fid, id, file.name, rev, file.size, file.type || "", now()),
    logStmt(db, id, "file", eventDate(form.get("event_date")), String(form.get("note") ?? "").trim(), fid),
  ]);
  return c.json({ id: fid, rev }, 201);
});

app.get("/gantt/files/:fid", async (c) => {
  if (!c.env.FILES) return c.json({ error: "file storage is not enabled" }, 501);
  const fid = c.req.param("fid");
  const [meta, obj] = await Promise.all([
    c.env.DB.prepare("SELECT name, type FROM gantt_files WHERE id = ?").bind(fid).first<{ name: string; type: string }>(),
    c.env.FILES.get("gantt/" + fid),
  ]);
  if (!meta || !obj) return c.json({ error: "not found" }, 404);
  return fileResponse(obj, meta.name, meta.type, c.req.query("download") !== undefined);
});

app.delete("/gantt/files/:fid", async (c) => {
  const fid = c.req.param("fid");
  await c.env.FILES?.delete("gantt/" + fid);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM gantt_events WHERE file_id = ?").bind(fid),
    c.env.DB.prepare("DELETE FROM gantt_files WHERE id = ?").bind(fid),
  ]);
  return c.json({ ok: true });
});

/* ---------- Flows ---------- */

app.get("/flows", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, title, updated_at FROM flows ORDER BY updated_at DESC",
  ).all();
  return c.json(results);
});

app.get("/flows/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM flows WHERE id = ?")
    .bind(c.req.param("id"))
    .first();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.post("/flows", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = uid();
  const t = now();
  await c.env.DB.prepare(
    "INSERT INTO flows (id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, b.title ?? "", b.data ?? "{}", t, t)
    .run();
  return c.json({ id }, 201);
});

app.put("/flows/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    "UPDATE flows SET title = COALESCE(?, title), data = COALESCE(?, data), updated_at = ? WHERE id = ?",
  )
    .bind(opt(b.title), opt(b.data), now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.delete("/flows/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM flows WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------- Documents (metadata in D1, bytes in R2) ---------- */

const INLINE_TYPES = /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp)|text\/plain)$/;

app.get("/docs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM docs ORDER BY created_at DESC").all();
  return c.json({ storage: !!c.env.FILES, items: results });
});

app.post("/docs", async (c) => {
  if (!c.env.FILES) return c.json({ error: "file storage is not enabled" }, 501);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  const id = uid();
  await c.env.FILES.put(id, file, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await c.env.DB.prepare(
    "INSERT INTO docs (id, name, size, type, tags, note, created_at) VALUES (?, ?, ?, ?, ?, '', ?)",
  )
    .bind(id, file.name, file.size, file.type || "", String(form.get("tags") ?? ""), now())
    .run();
  return c.json({ id }, 201);
});

app.get("/docs/:id/file", async (c) => {
  if (!c.env.FILES) return c.json({ error: "file storage is not enabled" }, 501);
  const id = c.req.param("id");
  const [meta, obj] = await Promise.all([
    c.env.DB.prepare("SELECT name, type FROM docs WHERE id = ?").bind(id).first<{ name: string; type: string }>(),
    c.env.FILES.get(id),
  ]);
  if (!meta || !obj) return c.json({ error: "not found" }, 404);
  // Only known-safe types render in the browser; everything else downloads.
  const inline = INLINE_TYPES.test(meta.type) && c.req.query("download") === undefined;
  return new Response(obj.body, {
    headers: {
      "Content-Type": inline ? meta.type : "application/octet-stream",
      "Content-Length": String(obj.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

app.put("/docs/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    "UPDATE docs SET name = COALESCE(?, name), tags = COALESCE(?, tags), note = COALESCE(?, note) WHERE id = ?",
  )
    .bind(opt(b.name), opt(b.tags), opt(b.note), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.delete("/docs/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.FILES?.delete(id);
  await c.env.DB.prepare("DELETE FROM docs WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/* ---------- Journal ---------- */

app.get("/journal", async (c) => {
  const month = c.req.query("month") ?? "";
  const { results } = await c.env.DB.prepare(
    "SELECT date, content FROM journal WHERE date LIKE ? ORDER BY date DESC",
  )
    .bind(month + "%")
    .all();
  return c.json(results);
});

app.get("/journal/:date", async (c) => {
  const date = c.req.param("date");
  // Client's UTC offset in minutes, so "done that day" follows local time.
  const tz = `${Number(c.req.query("tz")) || 0} minutes`;
  const db = c.env.DB;
  const [entry, todos, gantt, activity] = await db.batch([
    db.prepare("SELECT content FROM journal WHERE date = ?").bind(date),
    db
      .prepare("SELECT id, title FROM tasks WHERE status = 'done' AND date(updated_at, ?) = ? ORDER BY updated_at")
      .bind(tz, date),
    db
      .prepare("SELECT id, title FROM gantt_items WHERE progress >= 100 AND date(updated_at, ?) = ? ORDER BY updated_at")
      .bind(tz, date),
    db
      .prepare(
        `SELECT e.id, e.kind, i.title, e.body, f.name, f.rev
           FROM gantt_events e JOIN gantt_items i ON i.id = e.item_id LEFT JOIN gantt_files f ON f.id = e.file_id
          WHERE e.kind IN ('comment', 'file') AND e.event_date = ? ORDER BY e.created_at`,
      )
      .bind(date),
  ]);
  return c.json({
    date,
    content: (entry.results[0] as { content: string } | undefined)?.content ?? "",
    todos: todos.results,
    gantt: gantt.results,
    activity: activity.results,
  });
});

app.put("/journal/:date", async (c) => {
  const date = c.req.param("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "bad date" }, 400);
  const { content } = await c.req.json<{ content?: string }>();
  if (!content?.trim()) {
    await c.env.DB.prepare("DELETE FROM journal WHERE date = ?").bind(date).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO journal (date, content, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(date) DO UPDATE SET content = ?2, updated_at = ?3`,
    )
      .bind(date, content, now())
      .run();
  }
  return c.json({ ok: true });
});

/* ---------- Checklists ---------- */

type CheckItem = { text: string; done: boolean; note: string };
const cleanTemplateItems = (v: unknown) =>
  JSON.stringify(Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
const cleanCheckItems = (v: unknown): string =>
  JSON.stringify(
    Array.isArray(v)
      ? v
          .map((x) => ({ text: String(x?.text ?? "").trim(), done: !!x?.done, note: String(x?.note ?? "") }))
          .filter((x) => x.text)
      : [],
  );

app.get("/checklists", async (c) => {
  const db = c.env.DB;
  const [templates, lists] = await db.batch([
    db.prepare("SELECT * FROM checklist_templates ORDER BY name"),
    db.prepare("SELECT * FROM checklists ORDER BY updated_at DESC"),
  ]);
  return c.json({ templates: templates.results, lists: lists.results });
});

app.post("/checklist-templates", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = uid();
  const t = now();
  await c.env.DB.prepare("INSERT INTO checklist_templates (id, name, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, String(b.name ?? "").trim() || "?", cleanTemplateItems(b.items), t, t)
    .run();
  return c.json({ id }, 201);
});

app.put("/checklist-templates/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    "UPDATE checklist_templates SET name = COALESCE(?, name), items = COALESCE(?, items), updated_at = ? WHERE id = ?",
  )
    .bind(b.name === undefined ? null : String(b.name), b.items === undefined ? null : cleanTemplateItems(b.items), now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.delete("/checklist-templates/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM checklist_templates WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

app.post("/checklists", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const db = c.env.DB;
  let items = "[]";
  if (typeof b.template_id === "string") {
    const tpl = await db.prepare("SELECT items FROM checklist_templates WHERE id = ?").bind(b.template_id).first<{ items: string }>();
    if (!tpl) return c.json({ error: "template not found" }, 404);
    const texts: string[] = JSON.parse(tpl.items);
    items = JSON.stringify(texts.map((text): CheckItem => ({ text, done: false, note: "" })));
  }
  const id = uid();
  const t = now();
  await db
    .prepare("INSERT INTO checklists (id, template_id, name, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, typeof b.template_id === "string" ? b.template_id : null, String(b.name ?? "").trim() || "?", items, t, t)
    .run();
  return c.json({ id }, 201);
});

app.put("/checklists/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare("UPDATE checklists SET name = COALESCE(?, name), items = COALESCE(?, items), updated_at = ? WHERE id = ?")
    .bind(b.name === undefined ? null : String(b.name), b.items === undefined ? null : cleanCheckItems(b.items), now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.delete("/checklists/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM checklists WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------- Glossary ---------- */

const TERM_FIELDS = ["vi", "ja", "reading", "en", "note", "tags"] as const;

app.get("/glossary", async (c) => {
  const db = c.env.DB;
  const [groups, terms] = await db.batch([
    db.prepare("SELECT id, name, position FROM glossary_groups ORDER BY position, name"),
    db.prepare("SELECT * FROM glossary ORDER BY vi COLLATE NOCASE"),
  ]);
  return c.json({ groups: groups.results, terms: terms.results });
});

app.post("/glossary", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = uid();
  const t = now();
  await c.env.DB.prepare(
    "INSERT INTO glossary (id, vi, ja, reading, en, note, tags, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, ...TERM_FIELDS.map((f) => String(b[f] ?? "")), (b.group_id as string) || null, t, t)
    .run();
  return c.json({ id }, 201);
});

app.put("/glossary/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = c.req.param("id");
  const stmts = [
    c.env.DB.prepare(
      `UPDATE glossary SET ${TERM_FIELDS.map((f) => `${f} = COALESCE(?, ${f})`).join(", ")}, updated_at = ? WHERE id = ?`,
    ).bind(...TERM_FIELDS.map((f) => (b[f] === undefined ? null : String(b[f]))), now(), id),
  ];
  if ("group_id" in b)
    stmts.push(c.env.DB.prepare("UPDATE glossary SET group_id = ? WHERE id = ?").bind((b.group_id as string) || null, id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.post("/glossary-groups", async (c) => {
  const b = await c.req.json<{ name?: string }>();
  const name = b.name?.trim();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = uid();
  const last = await c.env.DB.prepare("SELECT MAX(position) AS p FROM glossary_groups").first<{ p: number | null }>();
  await c.env.DB.prepare("INSERT INTO glossary_groups (id, name, position, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, name, (last?.p ?? 0) + 1, now())
    .run();
  return c.json({ id }, 201);
});

app.put("/glossary-groups/:id", async (c) => {
  const b = await c.req.json<{ name?: string; position?: number }>();
  await c.env.DB.prepare("UPDATE glossary_groups SET name = COALESCE(?, name), position = COALESCE(?, position) WHERE id = ?")
    .bind(b.name?.trim() || null, b.position ?? null, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

/** Deleting a group keeps its terms; they just become ungrouped. */
app.delete("/glossary-groups/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE glossary SET group_id = NULL WHERE group_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM glossary_groups WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.delete("/glossary/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM glossary WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/* ---------- Site settings ---------- */

const SETTING_DEFAULTS: Record<string, string> = { site_name: "PhongLab", owner_name: "", default_lang: "en" };
const LANGS = ["vi", "ja", "en"];
const LOGO_KEY = "settings/logo";
const LOGO_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"];

async function readSettings(db: D1Database) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s: Record<string, string | null> = { ...SETTING_DEFAULTS, logo_updated: null };
  for (const r of results) s[r.key] = r.value;
  return s;
}
const putSetting = (db: D1Database, key: string, value: string) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2").bind(key, value);

app.get("/settings", async (c) => {
  const s = await readSettings(c.env.DB);
  return c.json({ site_name: s.site_name, owner_name: s.owner_name, default_lang: s.default_lang, logo_updated: s.logo_updated });
});

app.put("/settings", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const stmts: D1PreparedStatement[] = [];
  if (typeof b.site_name === "string") stmts.push(putSetting(c.env.DB, "site_name", b.site_name.trim().slice(0, 60) || "PhongLab"));
  if (typeof b.owner_name === "string") stmts.push(putSetting(c.env.DB, "owner_name", b.owner_name.trim().slice(0, 60)));
  if (typeof b.default_lang === "string" && LANGS.includes(b.default_lang))
    stmts.push(putSetting(c.env.DB, "default_lang", b.default_lang));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.put("/settings/logo", async (c) => {
  if (!c.env.FILES) return c.json({ error: "file storage is not enabled" }, 501);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  if (!LOGO_TYPES.includes(file.type)) return c.json({ error: "unsupported type" }, 415);
  if (file.size > 512 * 1024) return c.json({ error: "too large" }, 413);
  await c.env.FILES.put(LOGO_KEY, file, { httpMetadata: { contentType: file.type } });
  await putSetting(c.env.DB, "logo_updated", now()).run();
  return c.json({ ok: true });
});

app.delete("/settings/logo", async (c) => {
  await c.env.FILES?.delete(LOGO_KEY);
  await c.env.DB.prepare("DELETE FROM settings WHERE key = 'logo_updated'").run();
  return c.json({ ok: true });
});

app.get("/settings/logo", async (c) => {
  const obj = await c.env.FILES?.get(LOGO_KEY);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      // An uploaded SVG must never run script on this origin.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
});

/* ---------- Search across everything ---------- */

app.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json([]);
  // D1 caps a compound SELECT at 5 terms, so run one query per table and merge here.
  const like = `%${q}%`;
  const parts = [
    `SELECT 'notes' AS kind, id, title, substr(content, 1, 120) AS snippet, updated_at AS at FROM notes
       WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1`,
    `SELECT 'gantt' AS kind, id, title, assignee AS snippet, updated_at AS at FROM gantt_items
       WHERE title LIKE ?1 OR assignee LIKE ?1`,
    `SELECT 'tasks' AS kind, id, title, substr(note, 1, 120) AS snippet, updated_at AS at FROM tasks
       WHERE title LIKE ?1 OR note LIKE ?1`,
    `SELECT 'flow' AS kind, id, title, '' AS snippet, updated_at AS at FROM flows WHERE title LIKE ?1`,
    `SELECT 'docs' AS kind, id, name AS title, tags AS snippet, created_at AS at FROM docs
       WHERE name LIKE ?1 OR tags LIKE ?1 OR note LIKE ?1`,
    `SELECT 'journal' AS kind, date AS id, date AS title, substr(content, 1, 120) AS snippet, updated_at AS at
       FROM journal WHERE content LIKE ?1`,
    `SELECT 'gcomment' AS kind, i.id, i.title, substr(e.body, 1, 120) AS snippet, e.created_at AS at
       FROM gantt_events e JOIN gantt_items i ON i.id = e.item_id
      WHERE e.kind = 'comment' AND e.body LIKE ?1`,
    `SELECT 'gfile' AS kind, i.id, i.title, f.name || ' rev' || f.rev || CASE WHEN e.body != '' THEN ' · ' || e.body ELSE '' END AS snippet,
            f.created_at AS at
       FROM gantt_files f JOIN gantt_items i ON i.id = f.item_id LEFT JOIN gantt_events e ON e.file_id = f.id
      WHERE f.name LIKE ?1 OR e.body LIKE ?1`,
    `SELECT 'glossary' AS kind, id, vi || ' ⇄ ' || ja AS title,
            trim(reading || ' ' || en || ' ' || note) AS snippet, updated_at AS at
       FROM glossary WHERE vi LIKE ?1 OR ja LIKE ?1 OR reading LIKE ?1 OR en LIKE ?1 OR note LIKE ?1 OR tags LIKE ?1`,
    `SELECT 'checklist' AS kind, id, name AS title, '' AS snippet, updated_at AS at
       FROM checklists WHERE name LIKE ?1 OR items LIKE ?1`,
  ];
  const sets = await c.env.DB.batch<{ at: string }>(
    parts.map((sql) => c.env.DB.prepare(sql + " ORDER BY at DESC LIMIT 15").bind(like)),
  );
  const hits = sets.flatMap((s) => s.results).sort((a, b) => (a.at < b.at ? 1 : -1));
  return c.json(hits.slice(0, 40));
});

/* ---------- Home summary ---------- */

app.get("/summary", async (c) => {
  const db = c.env.DB;
  const [counts, open, notes, flows] = await db.batch([
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM notes) AS notes,
              (SELECT COUNT(*) FROM tasks WHERE status = 'todo') AS todo,
              (SELECT COUNT(*) FROM tasks WHERE status = 'doing') AS doing,
              (SELECT COUNT(*) FROM tasks WHERE status = 'done') AS done,
              (SELECT COUNT(*) FROM flows) AS flows`,
    ),
    db.prepare(
      `SELECT id, title, status, due, project_id FROM tasks WHERE status != 'done'
       ORDER BY (due IS NULL), due, position LIMIT 8`,
    ),
    db.prepare(
      "SELECT id, title, tags, pinned, updated_at FROM notes ORDER BY pinned DESC, updated_at DESC LIMIT 6",
    ),
    db.prepare("SELECT id, title, updated_at FROM flows ORDER BY updated_at DESC LIMIT 4"),
  ]);
  return c.json({
    counts: counts.results[0],
    tasks: open.results,
    notes: notes.results,
    flows: flows.results,
  });
});

app.all("*", (c) => c.json({ error: "not found" }, 404));

export default app;
