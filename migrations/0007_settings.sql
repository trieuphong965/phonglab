-- Per-site settings (site name, owner name, default language, custom logo), as key/value pairs.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
