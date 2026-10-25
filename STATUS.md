# Status: platform and portal

Updated 2026-10-25.

## Live
| Item | Since |
|---|---|
| fortifygrid.com, app.fortifygrid.com (portal + admin), heatmap / query / rev-anal on Workers behind Access | 2026-10-10 / 10-24 |
| Login: Access team `fortifyai` (Google + email code). Access groups synced from admin | ✅ |
| Auto-deploy on push for website, FGAI-RAG and revenue-analysis-module (repo secrets set) | ✅ |
| Dashboard folders: Market Data = heatmap, query. BTM Agentic Tools = revenue, ide. Staging site at `/staging/` (admins) | 2026-10-24 |
| IDE moved from ide.fortifygrid.com to **app.fortifygrid.com/ide/** (static, gated in `worker.js`; IFC / Excel only with the downloads tab) | 2026-10-25 |

## Open
- Retire the old `fortifygrid-ide` Worker, its ide.fortifygrid.com domain, and its Access app and group.
- Contact form doesn't send.
- Secrets in git history not rotated (owner's choice).
- AWS CLI root keys.
- 2026 short ISO names.
- Old Pages project `fortifygrid-website` can be deleted.
- Move subdomain apps under `app.fortifygrid.com/<app>/` (needs the forwarding gateway, INFRA.md "Hosts").
- `INFRA-PATTERN.md` (untracked draft, gateway pattern) is folded into INFRA.md. Delete it when you agree.
