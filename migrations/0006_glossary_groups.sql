-- Glossary terms can belong to one group (e.g. "PLC – programming").
CREATE TABLE IF NOT EXISTS glossary_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
ALTER TABLE glossary ADD COLUMN group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_glossary_group ON glossary (group_id);
