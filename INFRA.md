# FortifyGrid Infrastructure (for LLMs)

The human's steps are in **USER_SETUP.md**. This file covers everything an agent does. Keep §1 status current.

**Pattern:** a Cloudflare Worker with static assets sits behind Cloudflare Access, where people sign in with Google
or a one-time email code. The Worker verifies the Access token, roles live in D1, and admin saves sync emails into
Access groups. Pushing to `main` deploys through GitHub Actions. Data comes from AWS RDS Postgres through Hyperdrive,
with one read-only DB user per app.

## 1. Status (update when it changes)
| Item | State |
|---|---|
| fortifygrid.com, /dashboard, heatmap.fortifygrid.com live on Workers; old Pages domains removed; GitHub Pages off | ✅ 2026-10-10 |
| Login: Access team `fortifyai`, Google + email code; dashboard and heatmap Access apps + groups | ✅ |
| Auto-deploy: push `main` → Actions (secrets set in both repos, token `fortifygrid-setup`) | ✅ |
| Roles × tabs per app (admin → Apps → Tabs); heatmap tabs: filters, database, csv_upload, gis_layers, generators, results, search | ✅ |
| Data Query app `query.fortifygrid.com` (FGAI-RAG `apps/query/`): any exposed table/view/matview in all schemas via `query_ro` + Hyperdrive `query-db`; datasets + saved queries in D1 `fortifygrid-query`; tabs download/save/configure | ✅ 2026-10-10 |
| Old heatmap A record (18.232.37.189, dead EC2) replaced by the Worker | ✅ |
| Open | Contact form doesn't send. Secrets in git history not rotated (owner's choice). AWS CLI root keys. 2026 short ISO names. Old Pages project `fortifygrid-website` can be deleted |

## 2. Repos, accounts, IDs
| Repo `Fortify-Grid/…` | Local folder | Serves |
|---|---|---|
| `fortifygrid-website` | `Shared drives/4. Fortify AI LLC/11. AI Code/6. FortifyGrid Website` | fortifygrid.com: `public/` site, `worker.js` portal, `/dashboard`, `/dashboard/admin` |
| `FGAI-RAG` | `…/11. AI Code/2. FGAI-RAG` | One folder per app: `apps/heatmap/` (worker + `web/` viewer) → heatmap.fortifygrid.com, `apps/query/` → query.fortifygrid.com. Shared Access/role code: `shared/app-worker.js`. Website repo = site + portal only |
| `FGDataETL` | `~/FortifyAI/FGDataETL` | ETL into RDS `fortify` (not Cloudflare) |

- **Which repo:**
  - Site, login, users, apps → website.
  - Heatmap → FGAI-RAG.
  - Data → FGDataETL.
- **Accounts:**
  - Cloudflare account `5b09f3b0f591d77cd46739113e886479` (owner admin@fortifygrid.com). Zone `fortifygrid.com`.
  - Team `fortifyai.cloudflareaccess.com`.
  - D1 `fortifygrid-portal`. Hyperdrive `heatmap-db` → RDS `fortifygrid.c0zem4me47r0.us-east-1.rds.amazonaws.com/fortifygrid` as `heatmap_ro`.
- **Secrets:**
  - `~/.config/fortifygrid/secrets.env` (`CF_SETUP_TOKEN`, `CF_ACCOUNT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Load it with `set -a; . ~/.config/fortifygrid/secrets.env >/dev/null 2>&1; set +a`. **Never echo values. Pipe output through `sed -E 's/(cfut_|GOCSPX-)[A-Za-z0-9_-]+/\1***/g'`.**
  - DB URLs live in `FGAI-RAG/apps/<app>/.dev.vars` and `FGAI-RAG/.env.local` (both gitignored).
- **This Mac:**
  - `gh` must be `krishnanraghu`; run `gh auth switch -u krishnanraghu` if a push is denied.
  - For wrangler, pass the token through `CLOUDFLARE_API_TOKEN` (the default OAuth login is a different account).

## 3. Agent workflow (every change)
1. Pick the repo. Edit. No secrets in tracked files; no SQL from the browser.
2. Run `npm run check` (website) or `cd apps/<app> && npm run check`. For UI changes, also run `npm run dev` and look at the page.
3. Commit, then `git push origin main`. **The push is the deploy.** Confirm with `gh run list -L 1` and the §6 checks.
4. If it broke: `npx wrangler rollback`. Update §1 in the same commit when state changes.

## 4. First deploy / cutover (done 2026-10-10; for a new account: deploy without `routes` first, then detach Pages + CNAMEs and redeploy with routes)
```bash
set -a; . ~/.config/fortifygrid/secrets.env >/dev/null 2>&1; set +a
export CLOUDFLARE_API_TOKEN=$CF_SETUP_TOKEN CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID
# 1. Remove fortifygrid.com + www from the Pages project "fortifygrid-website", and their CNAMEs to *.pages.dev (API)
# 2. Website repo, branch portal-setup:
npm install && npm run db:schema && npx wrangler deploy
echo "$CF_SETUP_TOKEN" | npx wrangler secret put CF_API_TOKEN
# 3. FGAI-RAG: cd apps/<app> && npm install && npm run deploy
# 4. GitHub secrets (both repos): gh secret set CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID -R Fortify-Grid/<repo>
# 5. Merge portal-setup → main in the website repo; push FGAI-RAG main
# 6. Turn off GitHub Pages: gh api -X DELETE repos/Fortify-Grid/fortifygrid-website/pages
```
**Never merge `portal-setup` → `main` before step 1.** The Pages project builds `main` from the repo root, and would take the site down.

## 5. How it works
```
Browser → fortifygrid.com/dashboard  or  <app>.fortifygrid.com
 → Cloudflare Access: Google or email code; allowed only if the email is in that app's Access group
 → Worker (run_worker_first): PORTAL.config(appId) → {team_domain, aud} → verify JWT (iss, aud, exp, sig)
   → PORTAL.access(email, appId) → role, else 401/403 → serve ./dist, or /api/* → Hyperdrive → RDS (read-only)
Portal Worker fortifygrid-website (entrypoint Directory, service binding only) → D1: apps, users, app_access, settings, audit
Admin saves a user → syncAccessGroups() rewrites the email rules in the Access groups ("FortifyGrid users" for the
dashboard, "<Name> users" per app; ADMIN_EMAILS are always included)
```
- **Access apps:** self-hosted, all login methods, 24h sessions, HttpOnly cookie, SameSite Lax, policy Allow → group.
- **DNS:** nothing by hand. Worker `custom_domain` routes create the records and certificates.
- **Admin page:** tabs Users / Apps (Create Access provisions the Access app + group) / Settings (`dashboard_notice`) / Activity.
- **Portal API (`/dashboard/api/`):**
  - `me`, `admin/overview`, `admin/users`, `admin/apps`, `admin/settings`, `admin/sync`, `admin/audit`.
  - Writes require a same-origin JSON request.

## 6. Verify
```bash
curl -sI https://fortifygrid.com | head -1                       # 200
curl -sI https://fortifygrid.com/dashboard/ | grep -i location   # → fortifyai.cloudflareaccess.com
curl -sI https://heatmap.fortifygrid.com | grep -i location      # → Access login
```

## 7. New app
1. Create `apps/<app>/` in FGAI-RAG by copying `apps/query/` (smallest example). The Worker is `export default appWorker({ appId, devTabs, api })` from `shared/app-worker.js`. Set the Worker name, route host and API. Register the app, its tabs and role defaults in the portal `schema.sql` (see the `query` rows).
2. DB user, as `postgres`:
   ```sql
   CREATE ROLE <app>_ro LOGIN PASSWORD '<random>' CONNECTION LIMIT 20;
   ALTER ROLE <app>_ro SET statement_timeout='30s';
   ALTER ROLE <app>_ro SET default_transaction_read_only=on;
   GRANT CONNECT ON DATABASE fortifygrid TO <app>_ro;
   GRANT USAGE ON SCHEMA fortify TO <app>_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA fortify TO <app>_ro;
   ```
   Then add the URL to `app/.dev.vars`.
3. `DATABASE_URL=… node infra/cf-setup.mjs hyperdrive <app> <path>/app/wrangler.jsonc` (with the secrets loaded).
4. Admin → Apps: id, name, URL, roles, **Create Cloudflare Access**.
5. Copy `.github/workflows/deploy-query.yml`, set the GitHub secrets, push. The human adds users.

## 8. Rules & gotchas
- **Data lives in AWS RDS; D1 is only for app metadata** (users, roles, settings, configs, saved query definitions). Never copy grid data or query results into D1, KV or R2. Apps read RDS live through Hyperdrive.
- Every host is behind Access **and** the Worker verifies the JWT itself.
- `workers_dev` and `preview_urls` are off.
- `ADMIN_EMAILS` = krishnan@fortifygrid.com. They are always admins, so nobody can be locked out.
- No SQL from the browser: fixed, bound queries. One read-only DB user per app.
- `schema.sql` must stay idempotent. Keep the `Directory.config` and `Directory.access` signatures.
- Deploy the portal before any app.
- An app returns 401 until admin → Apps shows its Access as ready.
- New app tabs: mark UI panels `data-tab="<id>"`, add rows to `app_tabs` in `schema.sql`, enforce server-side with `PORTAL.tabs()`.
- After DNS changes this Mac may cache failures: test with `curl --resolve host:443:172.67.184.166`.
- CI refuses to deploy while any `wrangler.jsonc` still contains `REPLACE_`.
- FGDataETL no longer tracks `.env`, so `git pull` on other clones deletes it. Back it up first.
