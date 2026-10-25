# FortifyGrid platform (INFRA.md)

Same file in every FortifyGrid repo. Master: `Fortify-Grid/fortifygrid-website/INFRA.md`. To change it, edit the master, then copy it to the other repos.

Every repo has three docs:
- **INFRA.md** (this file): how the platform is wired.
- **README.md**: this app's requirements, design, code layout, and how to run, test and deploy it.
- **STATUS.md**: what is live, what is open, and what comes next. Update it with every change.

`AGENTS.md` points LLMs to these three files; `CLAUDE.md` is `@AGENTS.md`. Human-only setup steps are in `fortifygrid-website/USER_SETUP.md`.

## Flow
```
Edit in Drive working folder → git commit → push main → GitHub Actions → Cloudflare Worker → live
Browser → Cloudflare Access (Google or email code) → Worker verifies the Access JWT → role from portal D1 → page / API
Data: AWS RDS Postgres (read-only user per app) ← Hyperdrive ← app Worker.  D1 holds app metadata only.
```

## Hosts
| Host | Repo | What |
|---|---|---|
| fortifygrid.com | fortifygrid-website | Public site (`public/`) |
| app.fortifygrid.com | fortifygrid-website | Portal: tiles, admin (`/admin/`), API (`/api/`). Files in `public/dashboard/`, served at the host root |
| app.fortifygrid.com/ide/ | fortifygrid-ide | IDE / BIM viewer. The portal checks the role, then forwards to the `fortifygrid-ide` Worker (service binding `IDE`, no public route) |
| heatmap / query.fortifygrid.com | FGAI-RAG | `apps/heatmap/`, `apps/query/`. Own Workers |
| rev-anal.fortifygrid.com | revenue-analysis-module | Revenue Analysis. Own Worker |

**New apps go under `app.fortifygrid.com/<app>/`, not on a new subdomain:**
- Each app has its own repo and Worker, with no routes and `workers_dev` off.
- The portal checks the role, then forwards `/<app>/*` over a service binding: copy the `/ide/` block in `worker.js` and the `IDE` entry in `wrangler.jsonc`.
- The app Worker removes the `/<app>` prefix. Deploy the app before the portal.

Subdomain apps move to the portal path when they are next touched.

## Repos and working folders
| Repo `Fortify-Grid/…` | Working folder (Google Drive) |
|---|---|
| fortifygrid-website | `Shared drives/4. Fortify AI LLC/11. AI Code/6. FortifyGrid Website` |
| fortifygrid-ide | `Shared drives/4. Fortify AI LLC/11. AI Code/7. Fortify IDE-BIM` |
| FGAI-RAG | `Shared drives/4. Fortify AI LLC/11. AI Code/2. FGAI-RAG` |
| revenue-analysis-module | `Shared drives/4. Fortify AI LLC/11. AI Code/5. Revenue Analysis` |
| FGDataETL | `~/FortifyAI/FGDataETL` (ETL into RDS, not Cloudflare) |

Drive and Dropbox are for editing only. Git is what deploys. Rules:
- Gitignore `node_modules/`, `.wrangler/`, `.dev.vars` and `.env*`.
- Only one machine at a time works in a Drive-synced `.git`. A second machine uses a fresh `git clone`.
- Python virtualenvs go outside Drive (`~/.venvs/`).

## Login and roles
- **Access:** team `fortifyai.cloudflareaccess.com`, login with Google or email code. Session lasts 24 h, cookie is HttpOnly with SameSite Lax.
  - Each host has an Access app with an Allow policy for its group.
  - A host without an Access app is **open**. That is why new apps live under app.fortifygrid.com.
- **Every Worker verifies the JWT itself** (signature, `iss`, `aud`, `exp`). Never trust a header alone.
- **Roles live in portal D1 `fortifygrid-portal`**, in the tables `apps`, `users`, `app_access`, `app_tabs`, `role_tabs`, `settings` and `audit`.
  - Edit them at app.fortifygrid.com/admin/.
  - When an admin saves a user, the portal rewrites the email rules in the Access groups: "FortifyGrid users" for the portal, "<App> users" per app.
- **Subdomain app Workers** call the portal over a service binding (entrypoint `Directory`): `config(appId)` gives `{team_domain, aud}`, `access(email, appId)` gives the role, `tabs(email, appId)` gives the tab list. Shared code: `FGAI-RAG/shared/app-worker.js`. Repos that need it keep their own copy.
- **Tabs:**
  - Mark UI panels with `data-tab="<id>"`.
  - Add the tab to `app_tabs` in the portal's `schema.sql`.
  - Enforce it on the server with `PORTAL.tabs()`, or with `appTabs()` inside the portal.
- `ADMIN_EMAILS` = krishnan@fortifygrid.com. They are always admins, so nobody can be locked out.

## Accounts and secrets
- **Cloudflare:**
  - Account `5b09f3b0f591d77cd46739113e886479` (owner admin@fortifygrid.com), zone `fortifygrid.com`.
  - D1 `fortifygrid-portal`.
  - Hyperdrive `heatmap-db` and `query-db` → RDS `fortifygrid.c0zem4me47r0.us-east-1.rds.amazonaws.com/fortifygrid`.
- **Local secrets** (never in git or Drive): `~/.config/fortifygrid/secrets.env` holds `CF_SETUP_TOKEN`, `CF_ACCOUNT_ID`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
  - Load it: `set -a; . ~/.config/fortifygrid/secrets.env >/dev/null 2>&1; set +a`
  - **Never echo values.** Mask output with `sed -E 's/(cfut_|GOCSPX-)[A-Za-z0-9_-]+/\1***/g'`.
- **Wrangler:** use `CLOUDFLARE_API_TOKEN=$CF_SETUP_TOKEN CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID`. This Mac's default `wrangler login` is a different account.
- **GitHub:** pushes must come from the `krishnanraghu` account (`gh auth switch -u krishnanraghu`).
  - CI needs the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- **DB URLs:** in each app's `.dev.vars` (gitignored). Each app has one read-only DB user (`<app>_ro`, 30 s statement timeout).

## Change workflow (agents)
1. Pick the repo. Edit. No secrets in tracked files, and no SQL from the browser (fixed, bound queries only).
2. Run `npm run check`. For UI changes, also run `npm run dev` and look at the page.
   - Portal dev: `npx wrangler dev --var APP_HOST:fortifygrid.com`. The dev user comes from `.dev.vars`.
3. Commit, update STATUS.md, then push (or open a PR). **A push to `main` is the deploy.**
   - Check it with `gh run list -L 1`.
   - A deploy job that only prints "Set CLOUDFLARE_API_TOKEN…" did **not** deploy.
4. If a deploy broke something: `npx wrangler rollback`.
5. The portal deploys before any app. Its `schema.sql` must stay idempotent; it runs on every deploy.

## New app
- **Under the portal:** copy `fortifygrid-ide/app/` (Worker + `public/`) into a new repo, add a gate + binding in the portal (copy `/ide/`) and app, tab and role rows in `schema.sql` (copy the `ide` rows). Deploy the app, then the portal.
- **With data:** copy `FGAI-RAG/apps/query/` (Worker = `appWorker({ appId, devTabs, api })`), then:
  1. Create a read-only DB user as `postgres`: `CREATE ROLE <app>_ro LOGIN PASSWORD '…' CONNECTION LIMIT 20; ALTER ROLE <app>_ro SET statement_timeout='30s'; ALTER ROLE <app>_ro SET default_transaction_read_only=on;`, then grant `CONNECT` and schema `USAGE` + `SELECT`.
  2. `DATABASE_URL=… node infra/cf-setup.mjs hyperdrive <app> <path>/wrangler.jsonc` (secrets loaded).
  3. Admin → Apps: add the app → **Create Cloudflare Access**.
  4. Copy a deploy workflow, set the repo secrets, push.
- In both cases, the owner then adds users in admin.

## Verify
```bash
curl -sI https://fortifygrid.com | head -1                    # 200
curl -sI https://app.fortifygrid.com/ | grep -i location      # → fortifyai.cloudflareaccess.com
curl -sI https://heatmap.fortifygrid.com | grep -i location   # → Access login
```

## Gotchas
- Removing `routes` from a config does not detach a custom domain. Delete it in Workers → Settings → Domains.
- After DNS changes this Mac may cache failures. Check with `dig @1.1.1.1` or `curl --resolve host:443:172.67.184.166`.
- `wrangler dev` rewrites the request host to the first route in the config.
- CI refuses to deploy while any `wrangler.jsonc` contains `REPLACE_`.
- If npm fails on `~/.npm` permissions, use `npm_config_cache=$HOME/.cache/npm-fortifygrid`.
- Home-screen web apps on iPhone keep their own cookies, so the first open asks for sign-in again.
