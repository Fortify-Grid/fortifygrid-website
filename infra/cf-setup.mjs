#!/usr/bin/env node
// Idempotent Cloudflare setup for the FortifyGrid portal and its apps (see INFRA.md). Safe to re-run: finds before it creates.
//
//   CF_SETUP_TOKEN=... node infra/cf-setup.mjs portal
//       Login methods (one-time email code; Google if GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET set), the dashboard
//       Access group + Access app (fortifygrid.com/dashboard), D1 fortifygrid-portal. Fills ./wrangler.jsonc.
//
//   CF_SETUP_TOKEN=... DATABASE_URL=postgresql://<app>_ro:...@host:5432/db node infra/cf-setup.mjs hyperdrive <id> [app/wrangler.jsonc]
//       Hyperdrive config "<id>-db" (DB credentials stay in Cloudflare) and fills the app's wrangler.jsonc.
//
// An app's Access app + group are created from /dashboard/admin → Apps → "Create Cloudflare Access".
// CF_SETUP_TOKEN: an API token (My Profile → API Tokens → Create Custom Token) on the FortifyGrid account with
//   Account · Access: Apps and Policies · Edit
//   Account · Access: Organizations, Identity Providers, and Groups · Edit
//   Account · D1 · Edit        Account · Hyperdrive · Edit        Zone · Zone · Read
// Results also go to infra/.cf-setup.json (gitignored).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TOKEN = process.env.CF_SETUP_TOKEN;
const ZONE = process.env.ZONE || 'fortifygrid.com';
const ADMINS = (process.env.ADMIN_EMAILS || 'krishnan@fortifygrid.com').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = new URL('./.cf-setup.json', import.meta.url);
const PORTAL_WRANGLER = new URL('../wrangler.jsonc', import.meta.url);

if (!TOKEN) { console.error('Set CF_SETUP_TOKEN (see header of this file).'); process.exit(1); }

async function cf(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new Error(`${method} ${path}: ${(data.errors || []).map((e) => `${e.code} ${e.message}`).join('; ') || res.status}`);
  return data.result;
}

const saved = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const save = () => writeFileSync(OUT, JSON.stringify(saved, null, 2) + '\n');

function fill(file, values) {
  let text = readFileSync(file, 'utf8');
  for (const [key, val] of Object.entries(values)) {
    if (val) text = text.replace(new RegExp(`("${key}"\\s*:\\s*")[^"]*(")`), `$1${val}$2`);
  }
  writeFileSync(file, text);
}

async function account() {
  const zones = await cf(`/zones?name=${ZONE}`);
  if (!zones.length) throw new Error(`Zone ${ZONE} is not in an account this token can see. Log in as the owner and add the token there.`);
  return { accountId: zones[0].account.id, zoneId: zones[0].id };
}

async function teamDomain(acc) {
  try {
    const org = await cf(`/accounts/${acc}/access/organizations`);
    return org.auth_domain;
  } catch {
    throw new Error('Zero Trust is not set up yet: open dash.cloudflare.com → Zero Trust once, pick a team name and the Free plan, then re-run.');
  }
}

async function ensureLogins(acc, team) {
  const idps = await cf(`/accounts/${acc}/access/identity_providers`);
  const ids = [];
  let otp = idps.find((i) => i.type === 'onetimepin');
  if (!otp) otp = await cf(`/accounts/${acc}/access/identity_providers`, { method: 'POST', body: { type: 'onetimepin', name: 'Email code', config: {} } });
  ids.push(otp.id);
  let google = idps.find((i) => i.type === 'google');
  if (!google && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    google = await cf(`/accounts/${acc}/access/identity_providers`, {
      method: 'POST',
      body: { type: 'google', name: 'Google', config: { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET } },
    });
  }
  if (google) ids.push(google.id);
  else console.log(`! Google login not added. Create an OAuth client (redirect URI https://${team}/cdn-cgi/access/callback) and re-run with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.`);
  return ids;
}

async function ensureGroup(acc, name) {
  const groups = await cf(`/accounts/${acc}/access/groups`);
  const found = groups.find((g) => g.name === name);
  if (found) return found.id;
  const g = await cf(`/accounts/${acc}/access/groups`, { method: 'POST', body: { name, include: ADMINS.map((email) => ({ email: { email } })) } });
  return g.id;
}

async function ensureApp(acc, name, domain, groupId, idps) {
  const apps = await cf(`/accounts/${acc}/access/apps`);
  const existing = apps.find((a) => a.domain === domain);
  const body = {
    name, domain, type: 'self_hosted',
    session_duration: '24h',
    allowed_idps: idps,
    auto_redirect_to_identity: false,
    app_launcher_visible: false,
    http_only_cookie_attribute: true,
    same_site_cookie_attribute: 'lax',
    policies: [{ name: `${name} users`, decision: 'allow', include: [{ group: { id: groupId } }], precedence: 1 }],
  };
  const app = existing
    ? await cf(`/accounts/${acc}/access/apps/${existing.id}`, { method: 'PUT', body })
    : await cf(`/accounts/${acc}/access/apps`, { method: 'POST', body });
  return app.aud;
}

async function ensureD1(acc, name) {
  const list = await cf(`/accounts/${acc}/d1/database?name=${name}`);
  const found = list.find((d) => d.name === name);
  if (found) return found.uuid;
  return (await cf(`/accounts/${acc}/d1/database`, { method: 'POST', body: { name } })).uuid;
}

async function ensureHyperdrive(acc, name, dbUrl) {
  const u = new URL(dbUrl);
  const origin = {
    scheme: 'postgres', host: u.hostname, port: Number(u.port || 5432), database: u.pathname.slice(1),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  };
  const list = await cf(`/accounts/${acc}/hyperdrive/configs`);
  const found = list.find((h) => h.name === name);
  if (found) return (await cf(`/accounts/${acc}/hyperdrive/configs/${found.id}`, { method: 'PUT', body: { name, origin } })).id;
  return (await cf(`/accounts/${acc}/hyperdrive/configs`, { method: 'POST', body: { name, origin } })).id;
}

const [mode, id, host] = process.argv.slice(2); // host = app wrangler.jsonc path in hyperdrive mode
const { accountId, zoneId } = await account();
const team = await teamDomain(accountId);
const idps = await ensureLogins(accountId, team);
Object.assign(saved, { accountId, zoneId, team });

if (mode === 'portal') {
  const groupId = await ensureGroup(accountId, 'FortifyGrid users');
  const aud = await ensureApp(accountId, 'FortifyGrid Dashboard', `${ZONE}/dashboard`, groupId, idps);
  const d1 = await ensureD1(accountId, 'fortifygrid-portal');
  saved.portal = { groupId, aud, d1 };
  fill(PORTAL_WRANGLER, { CF_ACCESS_TEAM_DOMAIN: team, CF_ACCESS_AUD: aud, CF_ACCOUNT_ID: accountId, PORTAL_GROUP_ID: groupId, database_id: d1 });
} else if (mode === 'hyperdrive' && id && process.env.DATABASE_URL) {
  const hyperdrive = await ensureHyperdrive(accountId, `${id}-db`, process.env.DATABASE_URL);
  saved.hyperdrive = { ...(saved.hyperdrive || {}), [id]: hyperdrive };
  if (host) fill(host, { id: hyperdrive });
} else {
  console.error('Usage: cf-setup.mjs portal | hyperdrive <id> [app/wrangler.jsonc]  (hyperdrive needs DATABASE_URL)');
  process.exit(1);
}

save();
console.log(JSON.stringify(saved, null, 2));
console.log('\nDone. Review the wrangler.jsonc changes, commit and push to deploy.');
