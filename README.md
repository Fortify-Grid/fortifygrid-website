# FortifyGrid

AI-Driven, Modular Solutions for a Resilient, Adaptive Grid.

Cloudflare Worker serving the public site (`public/`) and the signed-in portal (`/dashboard`, `/dashboard/admin`),
which controls who can use every FortifyGrid app.

| Doc | |
|---|---|
| [INFRA.md](INFRA.md) | How login, apps, data access and deploys work; setup + new-app checklist |

```bash
npm install
cp .dev.vars.example .dev.vars && npm run db:schema:local && npm run dev   # http://localhost:8787
npm run check                                                             # before pushing
```
Push to `main` deploys (`.github/workflows/deploy.yml`).

## License

© 2024 Fortify Grid. All Rights Reserved.
