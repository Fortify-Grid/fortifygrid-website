-- fortifygrid-portal D1. Idempotent: runs on every deploy. Changes to existing tables → migrations/ first.
CREATE TABLE IF NOT EXISTS users (
  email        TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  is_admin     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  last_seen_at TEXT
);

-- One row per user per app they may open. role is one of that app's roles in worker.js APPS.
CREATE TABLE IF NOT EXISTS app_access (
  email  TEXT NOT NULL,
  app_id TEXT NOT NULL,
  role   TEXT NOT NULL,
  PRIMARY KEY (email, app_id)
);

CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at);

-- Registered apps (edited at /dashboard/admin → Apps). roles = JSON array, lowest first.
-- access_group_id / access_aud = the app's Cloudflare Access group and Access app audience (set by "Create Access").
CREATE TABLE IF NOT EXISTS apps (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  url             TEXT NOT NULL,
  roles           TEXT NOT NULL DEFAULT '["viewer","admin"]',
  access_group_id TEXT NOT NULL DEFAULT '',
  access_aud      TEXT NOT NULL DEFAULT '',
  enabled         INTEGER NOT NULL DEFAULT 1,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
INSERT OR IGNORE INTO apps (id, name, description, url, roles, created_at, updated_at) VALUES
  ('heatmap', 'Grid Heatmap', 'LMP price heatmap with generators and GIS layers, live from the FortifyGrid database.',
   'https://heatmap.fortifygrid.com/', '["viewer","admin"]', datetime('now'), datetime('now'));

-- Site config (edited at /dashboard/admin → Settings). Known keys: dashboard_notice (banner on the dashboard).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
