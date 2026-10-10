# FortifyGrid Infrastructure

The single reference for how FortifyGrid sites and apps are built, secured, deployed and connected to data.
Humans and LLMs read this first. Keep §2 (status) current.

**Pattern:** a Cloudflare Worker with static assets sits behind Cloudflare Access, where people sign in with Google
or a one-time email code. The Worker verifies the Access token, roles live in D1, and the admin page syncs emails
into Access groups. Pushing to `main` deploys through GitHub Actions. Data comes from AWS RDS Postgres through
Hyperdrive, with one read-only DB user per app.

**Legend:** 👤 = human (logins, consoles, tokens) · 🤖 = LLM/agent (code, commands, deploys)

---

## 1. Repos & identity

| Repo (GitHub `Fortify-Grid`) | Local folder | Holds | Serves |
|---|---|---|---|
| `fortifygrid-website` | `Shared drives/4. Fortify AI LLC/11. AI Code/6. FortifyGrid Website` | Public site `public/`, portal `worker.js`, this file | `fortifygrid.com` |
| `FGAI-RAG` | `…/11. AI Code/2. FGAI-RAG` | Heatmap viewer `HEATMAP/` + Worker `app/`, tools, docs | `heatmap.fortifygrid.com` |
| `FGDataETL` | `~/FortifyAI/FGDataETL` | Python ETL into RDS schema `fortify` | ETL server |

- **Which repo for a change:**
  - Site text, login, users, roles, app registry, this doc → `fortifygrid-website`.
  - Heatmap UI or API → `FGAI-RAG`.
  - Data ingest or schema → `FGDataETL`.
- **Accounts:**
  - Cloudflare account `5b09f3b0f591d77cd46739113e886479`: owner admin@fortifygrid.com, Super Admin krishnan@fortifygrid.com.
  - Google Cloud project "FortifyGrid Login" (krishnan@fortifygrid.com).
  - GitHub `krishnanraghu` (admin on all three repos).
- **On this Mac:**
  - `gh` also has `krishnandhruv4-hub` (read-only), which sometimes becomes active. If a push says "denied to krishnandhruv4-hub", run `gh auth switch -u krishnanraghu`.
  - Wrangler's default login is the Aceing account. For FortifyGrid, run `export XDG_CONFIG_HOME=$HOME/.config/fortifygrid` first.
- **Legacy:** archive `FG-Data-viewer` and `AI-DATA-View` once the heatmap is live.

---

## 2. Setup checklist & status (update the Status column as you go)

### A. Code & repos
| # | Who | Step | Status |
|---|---|---|---|
| A1 | 🤖 | Portal, admin page, heatmap app and CI written and tested locally | ✅ 2026-10-10 |
| A2 | 🤖 | All website images and fonts copied from Webflow's CDN into `public/assets/`. Added robots.txt, sitemap, 404 and `/privacy` | ✅ |
| A3 | 🤖 | RDS read-only user `heatmap_ro` created. Its password is only in `FGAI-RAG/app/.dev.vars` | ✅ |
| A4 | 🤖 | Pushed: website → branch `portal-setup` (not `main`, see C3); FGAI-RAG and FGDataETL → `main` | ✅ |

### B. Accounts & Cloudflare (one time)
| # | Who | Step | Status |
|---|---|---|---|
| B1 | 👤 | Cloudflare: get invited to account `5b09…6479` and select it in the account switcher. Confirm `fortifygrid.com` is listed | ✅ |
| B2 | 👤 | Zero Trust → team name `fortifyai` → Free plan → team domain `fortifyai.cloudflareaccess.com` | ✅ |
| B3 | 👤 | Google login, see B3 detail below | ⏳ client pending |
| B4 | 👤 | Create the 3 Cloudflare API tokens in §7 (account `5b09…6479`, zone `fortifygrid.com`). Note the Account ID | ⏳ |
| B5 | 🤖 | `cd "6. FortifyGrid Website" && npm install && CF_SETUP_TOKEN=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node infra/cf-setup.mjs portal`. Creates the login methods, the dashboard Access app and group, and D1, and fills `wrangler.jsonc`. 👤 pastes the values into a terminal, never into chat | ⏳ |
| B6 | 🤖 | `CF_SETUP_TOKEN=… DATABASE_URL="$(grep ^DATABASE_URL '../2. FGAI-RAG/app/.dev.vars' \| cut -d= -f2-)" node infra/cf-setup.mjs hyperdrive heatmap '../2. FGAI-RAG/app/wrangler.jsonc'` | ⏳ |
| B7 | 🤖 | `XDG_CONFIG_HOME=$HOME/.config/fortifygrid npx wrangler login` (👤 clicks Approve), then `npx wrangler secret put CF_API_TOKEN` with the access-sync token, then commit the filled `wrangler.jsonc` files | ⏳ |
| B8 | 👤 | GitHub → each of `fortifygrid-website` and `FGAI-RAG` → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN` (the deploy token) and `CLOUDFLARE_ACCOUNT_ID` | ⏳ |

**B3 detail: Google login (console.cloud.google.com, project "FortifyGrid Login")**
1. **Branding:**
   - App name `FortifyGrid`, support and developer email krishnan@fortifygrid.com.
   - Home page `https://fortifygrid.com`, privacy policy `https://fortifygrid.com/privacy`.
   - Authorized domains: `fortifygrid.com` and `cloudflareaccess.com`.
   - **No logo.** A logo forces a review that can take weeks.
2. **Audience:** External → **Publish app** → status *In production*. ✅ done.
   - Leave the yellow "requires verification" banner alone. Verification only changes the name shown on Google's screen. Login only asks for name and email, so there is no warning and no user cap.
3. **Clients → Create client → Web application:**
   - **Authorized redirect URIs** (not *JavaScript origins*): `https://fortifyai.cloudflareaccess.com/cdn-cgi/access/callback`
   - Copy the Client ID and secret.
   - If you get "Invalid Origin: URIs must not contain a path", the URL went into the JavaScript origins box. Leave that box empty.

### C. Go live (cutover from the old Pages site, about 1 min downtime)
| # | Who | Step | Status |
|---|---|---|---|
| C1 | 👤 | Cloudflare → Workers & Pages → **Pages** project `fortifygrid-website` → Settings → Builds → **Disconnect Git** | ⏳ |
| C2 | 👤 | Same project → Custom domains → remove `fortifygrid.com` and `www.fortifygrid.com`, then tell 🤖 "detached" right away | ⏳ |
| C3 | 🤖 | Merge `portal-setup` → `main` and push. Actions deploys the Worker, which claims the domains. **Never merge before C1–C2**: Pages builds `main` from the repo root, would find no `index.html`, and the site would go down | ⏳ |
| C4 | 🤖 | Run the §6 verify checks | ⏳ |
| C5 | 👤 | fortifygrid.com/dashboard → sign in → Manage users → **Apps** → Grid Heatmap → **Create Access** → **Users** → add people | ⏳ |
| C6 | 🤖 | Push FGAI-RAG (or re-run its workflow) so the heatmap deploys, then verify heatmap.fortifygrid.com | ⏳ |
| C7 | 👤 | Delete the old Pages project. GitHub → fortifygrid-website → Settings → Pages → Source **None** | ⏳ |
| C8 | 🤖 | Mark everything ✅ here | ⏳ |

### D. Open issues
- Contact form on the site doesn't send (`public/script.js` TODO). Planned: save to D1, add Admin → Messages, and email info@.
- **Rotate the secrets in git history:** the RDS `postgres` password (FGAI-RAG history) and the PJM/ERCOT/SMTP credentials (FGDataETL history). Then update `.env` on the ETL server.
- FGDataETL no longer tracks `.env`, so on any other clone `git pull` deletes it. Back it up before pulling: `cp .env /tmp/etl.env && git pull && cp /tmp/etl.env .env`.
- AWS CLI on the Mac uses root keys. Replace them with an IAM user.
- 2026 data uses short ISO names (`MISO`, `NEISO`, `NYISO`). Fix in FGDataETL.
- Never yet run against real Cloudflare: `cf-setup.mjs`, "Create Access", group sync, the `Directory` RPC. Fix them on the first run in B5–C6.

---

## 3. Agent workflow (every change after setup)

1. Pick the repo (§1). Edit. Never put secrets in tracked files; never send SQL from the browser.
2. Check: `npm run check` (website) or `cd app && npm run check` (heatmap). For UI changes also run `npm run dev` and look at the page.
3. `gh auth status` must show **krishnanraghu**. If not, `gh auth switch -u krishnanraghu`.
4. Commit when the human asks, then `git push origin main`. **The push is the deploy.**
5. Confirm with `gh run list -L 1`, then run the §6 checks. If it broke: `npx wrangler rollback`, then fix forward.
6. Update §2 and this file in the same commit when state or the pattern changes.

---

## 4. How it works

```
Browser → https://<app>.fortifygrid.com  or  fortifygrid.com/dashboard
  ▼
Cloudflare Access ─ not signed in → Google | email one-time code
  │ only if email ∈ that app's Access group ("FortifyGrid users" for the dashboard, "<Name> users" per app)
  │ adds header Cf-Access-Jwt-Assertion (RS256, iss=https://fortifyai.cloudflareaccess.com, aud=<app AUD>)
  ▼
App Worker (run_worker_first: every path, static files too)
  │ PORTAL.config(appId) → {team_domain, aud}      cached 5 min
  │ verify JWT signature, iss, exp, aud → email
  │ PORTAL.access(email, appId) → role | null      cached 60 s → 401/403 page if none
  │ serve ./dist, or /api/* → fixed SQL → env.HYPERDRIVE → RDS (read-only user)
  ▼
Portal Worker fortifygrid-website (entrypoint Directory, service binding only)
  └ D1 fortifygrid-portal: apps · users · app_access · settings · audit
```
Admin → save user → D1 → `syncAccessGroups()` rewrites the email rules in every Access group. The dashboard group
gets all active users; each app's group gets the users with a role in it. `ADMIN_EMAILS` are always included.

| Component | Name / value |
|---|---|
| Zone | `fortifygrid.com`: Cloudflare DNS, registrar Squarespace, mail on Google |
| Zero Trust team | `fortifyai.cloudflareaccess.com`. Login methods: Google + One-time PIN |
| Access apps | `fortifygrid.com/dashboard` (covers sub-paths) and `<app>.fortifygrid.com`. Self-hosted, all login methods, 24h session, HttpOnly cookie, SameSite Lax, app launcher hidden |
| Access policy | One per app: **Allow**, include Access group "<Name> users". Group members are email rules written by the portal; other rules you add by hand are kept |
| Portal Worker | `fortifygrid-website`: `worker.js`, `public/`, `schema.sql` (idempotent, runs every deploy) |
| App Worker | `fortifygrid-heatmap`: `app/worker/index.js`, `app/dist` built from `HEATMAP/`, binds `PORTAL` |
| Hyperdrive | `heatmap-db` → `fortifygrid.c0zem4me47r0.us-east-1.rds.amazonaws.com:5432/fortifygrid` |
| DNS | Nothing to set by hand. Worker `custom_domain` routes create the records and certificates |
| Sign out | `/cdn-cgi/access/logout` |

**D1 tables:**
- `apps` (id, name, url, roles JSON lowest→highest, access_group_id, access_aud, enabled)
- `users` (email, name, is_admin, active, last_seen_at)
- `app_access` (email, app_id, role)
- `settings` (key, value; e.g. `dashboard_notice`)
- `audit`

**Portal API** (needs an Access login; `admin/*` needs admin; writes need a same-origin JSON request):
`GET me`, `GET admin/overview`, `POST admin/users`, `DELETE admin/users/:email`, `POST admin/users/:email/invite`,
`POST admin/apps` (`provision:true` creates the Access app and group), `POST/DELETE admin/settings[/:key]`, `POST admin/sync`, `GET admin/audit`.

---

## 5. Security rules (keep)

1. Every host is behind an Access app **and** the Worker verifies the JWT itself.
2. `workers_dev: false` and `preview_urls: false`, so no address skips Access.
3. `ADMIN_EMAILS` in the portal `wrangler.jsonc` are always admins, so nobody can be locked out.
4. No SQL from the browser: fixed queries, bound parameters, whitelisted identifiers.
5. One RDS user per app: `SELECT` only, read-only transactions, 30 s statement timeout, 20 connections max.
6. Secrets only in `.dev.vars`, `.env*`, `infra/.cf-setup.json` (all gitignored), Hyperdrive, `wrangler secret`, or GitHub secrets.
7. Keep the `Directory.config(appId)` and `Directory.access(email, appId)` signatures. Change existing D1 tables only through a migration.

---

## 6. Data access, secrets, verify

| Who reads RDS | How | User |
|---|---|---|
| App Worker (prod) | `postgres(env.HYPERDRIVE.connectionString)` | `<app>_ro` (stored in Hyperdrive) |
| App Worker (local) | `cd app && npm run dev` reads `DATABASE_URL` from `app/.dev.vars` | `<app>_ro` |
| psql / tools | `set -a; source .env.local; set +a` in the FGAI-RAG root | `postgres` |
| ETL | FGDataETL `.env` → `DB_CONNECTION_STRING` | `postgres` (later: a separate `etl_rw` user) |

**Verify a deploy:**
```bash
curl -sI https://fortifygrid.com | head -1                       # 200
curl -sI https://fortifygrid.com/dashboard/ | grep -i location   # → fortifyai.cloudflareaccess.com
curl -sI https://heatmap.fortifygrid.com | grep -i location      # → Access login
```
Then in a browser: sign in → tiles → open the app. An email that isn't on the list gets "not authorized".
Logs: `npx wrangler tail fortifygrid-website` (or `fortifygrid-heatmap`).

---

## 7. Tokens & secrets

| Name | Where it lives | Permissions (account `5b09…6479`, zone `fortifygrid.com`) |
|---|---|---|
| `fortifygrid-setup` | Your Mac only (for `cf-setup.mjs`) | Access: Apps and Policies Edit · Access: Organizations, Identity Providers, and Groups Edit · D1 Edit · Hyperdrive Edit · Cloudflare Pages Edit · Zone Read · DNS Edit |
| `fortifygrid-deploy` | GitHub secret `CLOUDFLARE_API_TOKEN` in both repos | Workers Scripts Edit · D1 Edit · Hyperdrive Edit · Workers Routes Edit · Zone Read · DNS Edit |
| `fortifygrid-access-sync` | Portal `wrangler secret put CF_API_TOKEN` | Access: Apps and Policies Edit · Access: Organizations, Identity Providers, and Groups Edit |
| Account ID | GitHub secret `CLOUDFLARE_ACCOUNT_ID` | — |
| Google Client ID / secret | Zero Trust → Authentication → Google (set by B5) | — |
| `EMAIL_API_KEY` (optional) | Portal `wrangler secret` + `EMAIL_FROM` var | Resend invites; without it the admin page opens your mail app |
| `<app>_ro` password | Hyperdrive + `app/.dev.vars` | — |

---

## 8. Add a new app

1. 🤖 Copy FGAI-RAG `app/` into the app's repo. Set `APP_ID`, the Worker `name`, the route host, `scripts/build.mjs` and the queries.
2. 🤖 Create the DB user, as `postgres`:
   ```sql
   CREATE ROLE <app>_ro LOGIN PASSWORD '<openssl rand -hex 24>' CONNECTION LIMIT 20;
   ALTER ROLE <app>_ro SET statement_timeout = '30s';
   ALTER ROLE <app>_ro SET default_transaction_read_only = on;
   GRANT CONNECT ON DATABASE fortifygrid TO <app>_ro;
   GRANT USAGE ON SCHEMA fortify TO <app>_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA fortify TO <app>_ro;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA fortify GRANT SELECT ON TABLES TO <app>_ro;
   ```
   Put `DATABASE_URL=postgresql://<app>_ro:…@…/fortifygrid?sslmode=require` in `app/.dev.vars`.
3. 🤖 Create Hyperdrive: `node infra/cf-setup.mjs hyperdrive <app> <path>/app/wrangler.jsonc`, with `CF_SETUP_TOKEN` and `DATABASE_URL` set.
4. 👤 or 🤖 Admin → Apps: enter id, name, URL and roles, tick **Create Cloudflare Access**, Save.
5. 🤖 Copy `deploy-heatmap.yml` and fix its paths. 👤 adds the 2 GitHub secrets.
6. 🤖 Push. 👤 gives people roles in admin → Users.

---

## 9. Everyday

| Task | How |
|---|---|
| Give or remove access | Admin → Users (Access updates immediately) |
| Dashboard banner / site config | Admin → Settings (`dashboard_notice`) |
| Disable an app | Admin → Apps → untick **On** |
| Change code | §3: edit → check → push `main` → live in about 1 min |
| Run locally | Website: `cp .dev.vars.example .dev.vars && npm run db:schema:local && npm run dev`. Heatmap: `cd app && npm run dev` → :8787 |
| Rotate a DB password | `ALTER ROLE <app>_ro PASSWORD '…'`, then repeat §8 step 3 |

## 10. Gotchas
- Deploy the portal before any app. Apps bind to `fortifygrid-website#Directory`.
- An app returns 401 for everyone until admin → Apps shows its Access as **ready**.
- A domain still attached to Pages makes `wrangler deploy` fail. Detach it first (C1–C2).
- Access groups can't be empty, which is why `ADMIN_EMAILS` are always in them.
- CI refuses to deploy while any `wrangler.jsonc` still contains `REPLACE_`.
