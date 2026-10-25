# Status: platform and portal

Updated 2026-10-25.

## Live
| Item | Since |
|---|---|
| fortifygrid.com, app.fortifygrid.com (portal + admin), heatmap / query / rev-anal on Workers behind Access | 2026-10-10 / 10-24 |
| Login: Access team `fortifyai` (Google + email code). Access groups synced from admin | ✅ |
| Auto-deploy on push for website, FGAI-RAG and revenue-analysis-module (repo secrets set) | ✅ |
| Dashboard folders: Market Data = heatmap, query. BTM Agentic Tools = revenue, ide. Staging site at `/staging/` (admins) | 2026-10-24 |
| IDE at **app.fortifygrid.com/ide/**: the portal checks the role and forwards to the `fortifygrid-ide` Worker (no public route) | 2026-10-25 |

## Open
- Contact form doesn't send.
- Secrets in git history not rotated (owner's choice).
- AWS CLI root keys.
- 2026 short ISO names.
- Old Pages project `fortifygrid-website` can be deleted.
- Delete archived repo `comstock-viewer` (needs `gh auth refresh -s delete_repo`).
- Add STATUS.md to FGAI-RAG and FGDataETL. In revenue-analysis-module, rename HANDOFF.md to STATUS.md (it has an uncommitted edit).
- Move subdomain apps under `app.fortifygrid.com/<app>/` (copy the `/ide/` forwarding pattern).
