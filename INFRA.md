# FortifyGrid Infrastructure

Single reference for how FortifyGrid sites and apps are built, secured, deployed and connected to data.
Read this before changing auth, deploys, or adding an app. Keep it current when the pattern changes.

**Pattern:** Cloudflare Worker + static assets, behind Cloudflare Access (Google or one-time email PIN). The Worker
verifies the Access JWT. Roles live in D1. The admin UI syncs emails into Access groups. GitHub Actions deploys
on push. Data comes from AWS RDS Postgres through Hyperdrive, using one read-only DB user per app.

## 0. Current state (update this when it changes)

| Step | Status |
|---|---|
| Code for portal, admin, heatmap app, CI | ✅ written and tested locally (2026-10-10) |
| RDS read-only user `heatmap_ro` | ✅ created |
| Cloudflare: Zero Trust, IdPs, Access apps, D1, Hyperdrive, tokens (§7) | ⏳ not done. Needs a human |
| Live site today | Cloudflare **Pages** project `fortifygrid-website` (git-connected to this repo, builds `main` from the repo root). GitHub Pages is also enabled (unused) |
| Site assets | ✅ all images and fonts in `public/assets/` (previously on Webflow's CDN). Contact form does not send yet (`script.js` TODO) |
| Portal code on GitHub | branch `portal-setup`. **Do not merge to `main` until cutover (§7.7)**: Pages would rebuild from the root, find no `index.html`, and take the site down |
| GitHub secrets, domain cutover from Pages to the Worker | ⏳ not done |
| Untested against real Cloudflare | `infra/cf-setup.mjs`, admin "Create Access", Access group sync, `Directory` RPC |

## 0a. Agent workflow (any LLM making changes)

1. This file is the only platform reference (AGENTS.md / CLAUDE.md files just point here). Pick the repo using the "Which repo" rule in §1.
2. Edit. Never put secrets in tracked files. Never send SQL from the browser.
3. Verify locally: `npm run check` (portal) or `cd app && npm run check` (app). For UI changes also run `npm run dev` and open the page.
4. `gh auth status` must show the FortifyGrid GitHub account, not `krishnandhruv4-hub`. If it is wrong, stop and ask the human to run `gh auth login`.
5. Commit only when the human asks, then `git push origin main`. The push is the deploy; there is no other step.
6. Confirm: `gh run watch` (or `gh run list -L 1`) shows success, then run the checks in §9a.
7. If it broke: `npx wrangler rollback` (portal repo or `app/`), then fix forward.
8. If the pattern or the state changed, update this file (§0 especially) in the same commit.

Humans only: Cloudflare/Google/GitHub logins, creating API tokens and the OAuth client, Zero Trust onboarding, paying.
An agent may run `infra/cf-setup.mjs` and `wrangler` once the human has provided a token.

## 1. Repos (GitHub org `Fortify-Grid`)

| Repo | Local path | Purpose | Deploys to |
|---|---|---|---|
| `fortifygrid-website` | `Shared drives/4. Fortify AI LLC/11. AI Code/6. FortifyGrid Website` | Public site + portal (login, dashboard, admin) + this doc | `fortifygrid.com` (Worker `fortifygrid-website`) |
| `FGAI-RAG` | `…/11. AI Code/2. FGAI-RAG` | Analysis + apps. First app: Grid Heatmap (`app/` + `HEATMAP/`) | `heatmap.fortifygrid.com` (Worker `fortifygrid-heatmap`) |
| `FGDataETL` | `~/FortifyAI/FGDataETL` | Python ETL: ERCOT/PJM/… → RDS `fortify` schema | ETL server (not Cloudflare) |

Legacy repos to archive once FGAI-RAG is live: `FG-Data-viewer`, `AI-DATA-View`. `SQL-LLM` is separate.
Identity for all of it: **krishnan@fortifygrid.com** (Cloudflare, Google Cloud, GitHub).

**Which repo for a change:** site text, login, users/roles, app registry, this doc → `fortifygrid-website`.
Heatmap UI (`HEATMAP/`) or its API (`app/`) → `FGAI-RAG`. Ingest, schema or tables → `FGDataETL`.

## 2. Request flow

```
Browser
  │ 1. https://<app>.fortifygrid.com  or  fortifygrid.com/dashboard
  ▼
Cloudflare Access ── not signed in → login page: Google | email one-time PIN
  │ 2. allowed only if email ∈ that Access app's group  (dashboard: "FortifyGrid users"; app: "<Name> users")
  │ 3. adds header Cf-Access-Jwt-Assertion (RS256, iss=https://<team>.cloudflareaccess.com, aud=<app AUD>)
  ▼
App Worker (run_worker_first: true → every path, static files too)
  │ 4. PORTAL.config(appId) → {team_domain, aud}   (cached 5 min)
  │ 5. verify JWT signature (team certs), iss, exp, aud → email
  │ 6. PORTAL.access(email, appId) → role | null   (cached 60 s)  → 401/403 page if none
  │ 7. serve ./dist asset, or /api/* → fixed parameterised SQL via env.HYPERDRIVE → AWS RDS (read-only user)
  ▼
Portal Worker `fortifygrid-website` (service binding entrypoint `Directory`; not reachable from the internet)
  └── D1 `fortifygrid-portal`: apps · users · app_access · settings · audit
```

Admin flow: `/dashboard/admin` → save user → D1 → `syncAccessGroups()` rewrites email rules in every Access group
(dashboard group = all active users; app group = users with a role in it; `ADMIN_EMAILS` always included).

## 3. Components

| Thing | Where / name | Notes |
|---|---|---|
| Cloudflare account | `5b09f3b0f591d77cd46739113e886479`. Owner **admin@fortifygrid.com**; krishnan@fortifygrid.com is Super Admin (invited 2026-10-10) | Pick this account in the switcher before creating tokens |
| Zone | `fortifygrid.com` (Cloudflare DNS; registrar Squarespace; MX Google) | |
| Zero Trust team | `<team>.cloudflareaccess.com` | Login methods: Google (OAuth client in Google Cloud) + One-time PIN |
| Access app: dashboard | domain `fortifygrid.com/dashboard`, group "FortifyGrid users" | Created by `infra/cf-setup.mjs portal` |
| Access app per app | domain `<app>.fortifygrid.com`, group "<Name> users" | Created from admin → Apps → **Create Access** |
| Portal Worker | `fortifygrid-website`: `worker.js`, `public/`, `schema.sql` | `public/` = site; `/dashboard/api/*` = API |
| D1 | `fortifygrid-portal` | `schema.sql` is idempotent and runs on every deploy |
| App Worker | e.g. `fortifygrid-heatmap`: `app/worker/index.js`, `app/dist` (built) | Binds `PORTAL` → `fortifygrid-website#Directory` |
| Hyperdrive | `<app>-db` → RDS `fortifygrid.c0zem4me47r0.us-east-1.rds.amazonaws.com:5432/fortifygrid` | Holds the DB password. Pools connections |
| RDS users | `postgres` (admin/ETL only), `<app>_ro` per app | `heatmap_ro` exists |

### Zero Trust / Access settings (what the scripts create; check or rebuild by hand in Zero Trust → Access)

| Setting | Value |
|---|---|
| Login methods (Settings → Authentication) | **Google** (OAuth client ID + secret) and **One-time PIN** |
| Access app type | Self-hosted. Domain `fortifygrid.com/dashboard` (covers all sub-paths) or `<app>.fortifygrid.com` |
| Identity providers on each app | All of the above. Instant auth off |
| Session duration | 24h. Cookies: HttpOnly on, SameSite Lax |
| Policy (one per app) | Name "<Name> users". Action **Allow**. Include → Access group "<Name> users" (dashboard: "FortifyGrid users") |
| Group membership | Email rules, written by the portal from D1. Add domain or other rules by hand if needed; sync keeps them |
| App launcher | Hidden (the dashboard is the launcher). Sign out: `/cdn-cgi/access/logout` |
| DNS | None to create by hand. Worker `custom_domain` routes create the records and certificates on deploy |

### D1 tables (portal)
- `apps(id, name, description, url, roles JSON lowest→highest, access_group_id, access_aud, enabled, sort)`
- `users(email PK, name, is_admin, active, last_seen_at)` · `app_access(email, app_id, role)`
- `settings(key, value)`: site config edited in admin → Settings. Known key: `dashboard_notice` (dashboard banner)
- `audit(at, actor, action, target, detail)`: every admin change

### Portal API (all need an Access login; `admin/*` needs admin)
`GET me` · `GET admin/overview` · `POST admin/users` (upsert + sync + optional invite) · `DELETE admin/users/:email` ·
`POST admin/users/:email/invite` · `POST admin/apps` (upsert; `provision:true` creates the Access app + group) ·
`POST/DELETE admin/settings[/:key]` · `POST admin/sync` · `GET admin/audit`.
Writes require `Origin` = own origin and a JSON body (blocks cross-site form posts).

## 4. Security rules (keep these)

1. Every host is behind an Access app **and** the Worker verifies the JWT itself (iss, aud, exp, signature).
2. `workers_dev: false`, `preview_urls: false`: no `*.workers.dev` address that skips Access.
3. `ADMIN_EMAILS` (portal `wrangler.jsonc`) are always admins with every app's top role, so nobody gets locked out.
4. The browser never sends SQL. Use fixed queries, bound parameters, and whitelisted identifiers (`sql(metric)` only from a list).
5. Each app gets its own RDS user with `SELECT` only, `default_transaction_read_only=on`, `statement_timeout=30s`, `CONNECTION LIMIT 20`.
6. Secrets are never in git: `.dev.vars`, `.env*`, `infra/.cf-setup.json` are gitignored. In production: Hyperdrive config, `wrangler secret`, GitHub Actions secrets.
7. Token scopes are minimal (see §6). The portal's runtime token can only edit Access.
8. Portal `schema.sql` must stay idempotent (it runs on every deploy). Changing an existing table needs a separate migration, applied first.
9. Keep the `Directory.config(appId)` / `Directory.access(email, appId)` signatures: every app Worker depends on them.

## 5. Data access

| Who | How | Credential |
|---|---|---|
| App Worker (prod) | `postgres(env.HYPERDRIVE.connectionString)` (postgres.js, `nodejs_compat`) | in Hyperdrive config |
| App Worker (local) | `npm run dev` sets `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` from `app/.dev.vars` | `<app>_ro` |
| Ad-hoc psql / tools | `set -a; source .env.local; set +a; psql` (FGAI-RAG root) | `postgres` |
| ETL | FGDataETL `.env` → `DB_CONNECTION_STRING` | `postgres` (move to an `etl_rw` user later) |

RDS is publicly reachable with SSL on. Optional hardening: restrict the security group to Cloudflare Hyperdrive egress plus office/ETL IPs.

## 6. Secrets & tokens

| Name | Kind | Where | Permissions |
|---|---|---|---|
| `fortifygrid-setup` | CF API token | your Mac only, for `infra/cf-setup.mjs` | Access Apps+Policies Edit, Access Orgs/IdPs/Groups Edit, D1 Edit, Hyperdrive Edit, Zone Read |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret (each repo) | deploy | Workers Scripts Edit, D1 Edit, Hyperdrive Edit, Workers Routes Edit, Zone Read |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | deploy | |
| `CF_API_TOKEN` | portal `wrangler secret` | Access sync + Create Access | Access Orgs/IdPs/Groups Edit, Access Apps+Policies Edit |
| `EMAIL_API_KEY` | portal `wrangler secret` (optional) | invite emails via Resend; set `EMAIL_FROM` var | |
| Google OAuth client | Zero Trust → Authentication → Google | login | redirect `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback` |
| `<app>_ro` password | Hyperdrive config + `app/.dev.vars` | DB | |

Wrangler on this Mac also has an Aceing login. Use `export XDG_CONFIG_HOME=$HOME/.config/fortifygrid` before `npx wrangler login` so the two logins stay separate.

## 7. One-time setup (done once per Cloudflare account)

1. Cloudflare dashboard as krishnan@fortifygrid.com: switch to account `5b09f3b0…6479` (owner admin@fortifygrid.com) and confirm the zone `fortifygrid.com` is there.
2. Zero Trust → choose a team name → Free plan.
3. Google Cloud → Credentials → OAuth client (Web) → set the redirect URI from §6.
4. Create the three tokens in §6.
5. In the portal repo: `npm install`, then `CF_SETUP_TOKEN=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node infra/cf-setup.mjs portal`.
   This creates the login methods, the dashboard Access app and group, and D1, and fills the `REPLACE_*` values in `wrangler.jsonc`.
6. `npx wrangler secret put CF_API_TOKEN` (portal repo).
7. **Cutover from Pages**, in this order: (a) Workers & Pages → `fortifygrid-website` (Pages) → Settings → Builds → **disconnect Git** (or pause deployments); (b) remove its custom domains `fortifygrid.com` and `www`; (c) merge `portal-setup` → `main`, so Actions deploys the Worker and claims the domains; (d) check §9a; (e) delete the Pages project and turn off GitHub Pages (repo Settings → Pages). The site is down for about a minute between (b) and (c).
8. GitHub: `gh auth login` as the FortifyGrid account. In each repo, add the Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
9. Push the portal first, then each app.

## 8. New app checklist

1. **Code**: copy FGAI-RAG `app/` (`worker/index.js`, `wrangler.jsonc`, `package.json`, `scripts/`) into the app's repo.
   Set `APP_ID`, the Worker `name`, the `routes` host, the UI build in `scripts/build.mjs`, and the API queries.
2. **DB user** (if the app reads RDS), as `postgres`:
   ```sql
   CREATE ROLE <app>_ro LOGIN PASSWORD '<openssl rand -hex 24>' CONNECTION LIMIT 20;
   ALTER ROLE <app>_ro SET statement_timeout = '30s';
   ALTER ROLE <app>_ro SET default_transaction_read_only = on;
   GRANT CONNECT ON DATABASE fortifygrid TO <app>_ro;
   GRANT USAGE ON SCHEMA fortify TO <app>_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA fortify TO <app>_ro;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA fortify GRANT SELECT ON TABLES TO <app>_ro;
   ```
   Add `DATABASE_URL=postgresql://<app>_ro:…@…/fortifygrid?sslmode=require` to `app/.dev.vars`.
3. **Hyperdrive**: `CF_SETUP_TOKEN=… DATABASE_URL=… node infra/cf-setup.mjs hyperdrive <app> <path>/app/wrangler.jsonc`.
4. **Register**: fortifygrid.com/dashboard/admin → Apps → enter id, name, URL, roles, tick **Create Cloudflare Access** → Save.
5. **CI**: copy `.github/workflows/deploy-heatmap.yml` and fix its `paths`. Add the repo secrets from §6.
6. **Ship**: push. In admin → Users, give yourself a role, then open the tile.

## 9. Everyday

| Task | How |
|---|---|
| Give or remove access | admin → Users: add an email and pick roles, or untick Active / Remove. Access updates immediately |
| Site config / dashboard banner | admin → Settings (e.g. `dashboard_notice`) |
| Disable an app | admin → Apps → untick **On** (tile hidden, Worker denies everyone) |
| Change code | edit → `npm run check` → commit → push `main` → live in about 1 min (GitHub Actions tab) |
| Run locally | portal: `cp .dev.vars.example .dev.vars && npm run db:schema:local && npm run dev`. App: `cd app && npm run dev` → :8787 (signed in as `DEV_USER_EMAIL`, real DB) |
| Logs | `npx wrangler tail <worker>` or dashboard → Workers → Observability |
| Rotate a DB password | `ALTER ROLE <app>_ro PASSWORD '…'`, then repeat step 8.3 with the new `DATABASE_URL` |

## 9a. Verify a deploy

```bash
curl -sI https://fortifygrid.com | head -1                                    # 200: public site
curl -sI https://fortifygrid.com/dashboard/ | grep -i location                # 302 → <team>.cloudflareaccess.com
curl -sI https://heatmap.fortifygrid.com | grep -i location                   # 302 → Access login
curl -s -o /dev/null -w '%{http_code}\n' https://fortifygrid-heatmap.<sub>.workers.dev   # must fail: workers.dev is off
```
In a browser: sign in → dashboard shows tiles → open the app. An email that isn't listed gets Access's "not authorized" page.
Logs: `npx wrangler tail fortifygrid-website` / `fortifygrid-heatmap`.

## 10. Gotchas

- Deploy order matters: the portal must exist before any app that binds to `fortifygrid-website#Directory`.
- An app returns 401 for everyone until admin → Apps shows its Access as **ready** (that is where the `aud` comes from).
- A custom domain already attached to Pages or another Worker makes `wrangler deploy` fail. Detach it first.
- Access groups cannot be empty, which is why `ADMIN_EMAILS` are always included in them.
- 2026 data uses short ISO names (`MISO`, `NEISO`, `NYISO`) where 2019–2025 use long ones. Fix this in FGDataETL.
