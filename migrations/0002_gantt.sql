CREATE TABLE IF NOT EXISTS gantt_items (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  assignee TEXT NOT NULL DEFAULT '',
  depends_on TEXT,
  position REAL NOT NULL DEFAULT 0,
  collapsed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gantt_parent ON gantt_items (parent_id, position);
