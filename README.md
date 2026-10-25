# FortifyGrid

AI-Driven, Modular Solutions for a Resilient, Adaptive Grid.

Cloudflare Worker serving the public site (`public/`) and the signed-in portal at app.fortifygrid.com (`/`, `/admin/`; files in `public/dashboard/`),
which controls who can use every FortifyGrid app.

| Doc | |
|---|---|
| [USER_SETUP.md](USER_SETUP.md) | Your setup steps (human) |
| [INFRA.md](INFRA.md) | How it works + what an LLM runs |

```bash
npm install
cp .dev.vars.example .dev.vars && npm run db:schema:local && npm run dev   # http://localhost:8787
npm run check                                                             # before pushing
```
Push to `main` deploys (`.github/workflows/deploy.yml`).

## License

© 2024 Fortify Grid. All Rights Reserved.
