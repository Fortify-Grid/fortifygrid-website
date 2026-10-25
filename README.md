# FortifyGrid website and portal

One Cloudflare Worker (`worker.js`) serves:
- **fortifygrid.com**: the public site, from `public/`.
- **app.fortifygrid.com**: the signed-in portal, from `public/dashboard/` at the host root.
  - Tiles: `/`
  - Admin (users, apps, roles, tabs, settings): `/admin/`
  - Portal API: `/api/`
  - `/ide/`: role check, then forwarded to the IDE app (repo `fortifygrid-ide`)

Platform wiring is in INFRA.md. Human setup steps are in USER_SETUP.md.

| Path | What |
|---|---|
| `worker.js` | Routing, Access JWT check, roles (D1), admin API, Access group sync, `Directory` RPC for app Workers, `/<app>/` gate + forward |
| `schema.sql` | Portal D1 tables and app rows. Idempotent; runs on every deploy |
| `public/` | Public site |
| `public/dashboard/` | Portal pages (`index.html`, `admin/`, `staging/`) |
| `infra/cf-setup.mjs` | One-time Cloudflare setup (Access, Hyperdrive) |

```bash
npm install
cp .dev.vars.example .dev.vars && npm run db:schema:local
npx wrangler dev --var APP_HOST:fortifygrid.com    # portal at http://localhost:8787
npm run check                                     # before pushing
```
A push to `main` deploys: `.github/workflows/deploy.yml` applies `schema.sql`, then runs `wrangler deploy`.

**IDE viewer:**
- Edit `public/dashboard/ide/index.html` directly. Its model data is embedded in the page.
- For new IFC / Excel files, run the engine in `fortifygrid-ide` and copy the outputs into `public/dashboard/ide/files/`.

© 2024 Fortify Grid. All Rights Reserved.
