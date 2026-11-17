-- Planned and actual hours per Gantt task (NULL = not entered).
ALTER TABLE gantt_items ADD COLUMN plan_hours REAL;
ALTER TABLE gantt_items ADD COLUMN actual_hours REAL;

-- Reusable checklist templates; items is a JSON array of strings.
CREATE TABLE IF NOT EXISTS checklist_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A checklist being worked through; items is a JSON array of {text, done, note}.
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  template_id TEXT,
  name TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklists_updated ON checklists (updated_at DESC);

-- Vietnamese–Japanese glossary.
CREATE TABLE IF NOT EXISTS glossary (
  id TEXT PRIMARY KEY,
  vi TEXT NOT NULL DEFAULT '',
  ja TEXT NOT NULL DEFAULT '',
  reading TEXT NOT NULL DEFAULT '',
  en TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
