-- Per-task timeline: comments, file uploads and automatic change records.
CREATE TABLE IF NOT EXISTS gantt_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'comment' | 'file' | 'change'
  event_date TEXT NOT NULL,      -- YYYY-MM-DD the event is about (user-chosen for comments/files)
  body TEXT NOT NULL DEFAULT '', -- comment text, file note, or JSON list of changes
  file_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gevents_item ON gantt_events (item_id, event_date DESC, created_at DESC);

-- Attached files; same name on the same task = next revision. Bytes live in R2 under "gantt/<id>".
CREATE TABLE IF NOT EXISTS gantt_files (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rev INTEGER NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gfiles_item ON gantt_files (item_id, name, rev);
