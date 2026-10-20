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

-- Tabs each app has (its UI marks them data-tab="<tab>") and which role may see which (admin → Apps → Tabs).
CREATE TABLE IF NOT EXISTS app_tabs (
  app_id TEXT NOT NULL,
  tab    TEXT NOT NULL,
  label  TEXT NOT NULL,
  sort   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, tab)
);
CREATE TABLE IF NOT EXISTS role_tabs (
  app_id TEXT NOT NULL,
  role   TEXT NOT NULL,
  tab    TEXT NOT NULL,
  PRIMARY KEY (app_id, role, tab)
);
INSERT OR IGNORE INTO app_tabs (app_id, tab, label, sort) VALUES
  ('heatmap', 'filters', 'Filters (left pane)', 1),
  ('heatmap', 'database', 'Load from Database', 2),
  ('heatmap', 'csv_upload', 'Load CSV', 3),
  ('heatmap', 'gis_layers', 'GIS layers', 4),
  ('heatmap', 'generators', 'Generators', 5),
  ('heatmap', 'results', 'Results table', 6),
  ('heatmap', 'search', 'Address search', 7);
-- Defaults only on first run, so admin changes are never overwritten by a deploy.
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'heatmap', 'viewer', tab FROM app_tabs WHERE app_id = 'heatmap' AND tab IN ('filters', 'gis_layers', 'generators', 'results', 'search')
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'heatmap');
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'heatmap', 'admin', tab FROM app_tabs WHERE app_id = 'heatmap'
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'heatmap' AND role = 'admin');

-- Data Query app (FGAI-RAG/query). Tabs: download = CSV export, save = save/delete queries, configure = choose datasets.
INSERT OR IGNORE INTO apps (id, name, description, url, roles, sort, created_at, updated_at) VALUES
  ('query', 'Data Query', 'Filter any exposed table or view with cascading lists, view or download results, save queries.',
   'https://query.fortifygrid.com/', '["viewer","admin"]', 2, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO app_tabs (app_id, tab, label, sort) VALUES
  ('query', 'download', 'Download CSV', 1),
  ('query', 'save', 'Save queries', 2),
  ('query', 'configure', 'Configure datasets', 3);
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'query', 'viewer', tab FROM app_tabs WHERE app_id = 'query' AND tab IN ('download', 'save')
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'query');
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'query', 'admin', tab FROM app_tabs WHERE app_id = 'query'
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'query' AND role = 'admin');

-- Revenue Analysis app (Fortify-Grid/revenue-analysis-module). Append to fortifygrid-website schema.sql (idempotent).
-- Tabs: analyze = upload / run / change battery settings, export = Excel / PDF / zip, admin = delete customers.
-- Roles: viewer sees results, analyst runs analyses, admin everything.
INSERT OR IGNORE INTO apps (id, name, description, url, roles, sort, created_at, updated_at) VALUES
  ('revenue', 'Revenue Analysis', 'Utility bills + interval data: learned tariffs by utility, bill recreation, battery savings and payback.',
   'https://rev-anal.fortifygrid.com/', '["viewer","analyst","admin"]', 3, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO app_tabs (app_id, tab, label, sort) VALUES
  ('revenue', 'analyze', 'Run analyses', 1),
  ('revenue', 'export', 'Export Excel / PDF', 2),
  ('revenue', 'admin', 'Delete customers', 3);
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'revenue', 'viewer', tab FROM app_tabs WHERE app_id = 'revenue' AND tab IN ('export')
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'revenue');
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'revenue', 'analyst', tab FROM app_tabs WHERE app_id = 'revenue' AND tab IN ('analyze', 'export')
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'revenue' AND role = 'analyst');
INSERT INTO role_tabs (app_id, role, tab)
  SELECT 'revenue', 'admin', tab FROM app_tabs WHERE app_id = 'revenue'
  AND NOT EXISTS (SELECT 1 FROM role_tabs WHERE app_id = 'revenue' AND role = 'admin');
