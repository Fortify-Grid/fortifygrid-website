// fortifygrid.com — public site (./public) plus the signed-in portal at /dashboard. See INFRA.md.
//
// Sign-in is Cloudflare Access (Google or one-time email code) in front of /dashboard and every app host.
// This Worker is the one place that decides who may use which app. Everything is in D1 `fortifygrid-portal`
// and edited at /dashboard/admin/:
//   - apps:       registered apps (tile, URL, roles, their Cloudflare Access app + group)
//   - users:      people, admin flag, active flag;  app_access: role per user per app
//   - settings:   site config (key → value), e.g. dashboard_notice
//   - audit:      every admin change
// Saving a user re-syncs the Cloudflare Access groups, so Access only lets listed people through.
// App Workers call `Directory` over a service binding: config(appId) for JWT checks, access(email, appId) for the role.

import { WorkerEntrypoint } from 'cloudflare:workers';

const now = () => new Date().toISOString();
const normEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const SETTING_KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;
const ROLE_RE = /^[a-z][a-z0-9_-]{1,20}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
    },
  });

const teamDomain = (env) => (env.CF_ACCESS_TEAM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

/* ---------- Cloudflare Access JWT ----------
   Access signs every request it lets through (Cf-Access-Jwt-Assertion). We verify signature (team public keys),
   issuer, expiry and audience, then trust the email inside. Config: CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD. */

const b64urlDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const parsePart = (s) => JSON.parse(new TextDecoder().decode(b64urlDecode(s)));
let jwks = { at: 0, domain: '', keys: [] };

async function signingKey(domain, kid) {
  for (const refresh of [false, true]) {
    if (refresh || jwks.domain !== domain || Date.now() - jwks.at > 3600_000) {
      const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
      if (!res.ok) throw new Error('Could not load Access keys');
      jwks = { at: Date.now(), domain, keys: (await res.json()).keys };
    }
    const jwk = jwks.keys.find((k) => k.kid === kid);
    if (jwk) return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  return null;
}

async function accessEmail(req, env) {
  if (env.ENVIRONMENT === 'development' && env.DEV_USER_EMAIL) return normEmail(env.DEV_USER_EMAIL);
  const domain = teamDomain(env);
  const auds = (env.CF_ACCESS_AUD || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!domain || !auds.length) return null;
  const token = req.headers.get('cf-access-jwt-assertion') || '';
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  try {
    const header = parsePart(h);
    const payload = parsePart(p);
    if (header.alg !== 'RS256') return null;
    const key = await signingKey(domain, header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`));
    const t = Date.now() / 1000;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!ok || payload.iss !== `https://${domain}` || !payload.exp || payload.exp < t || !aud.some((a) => auds.includes(a))) return null;
    return payload.email ? normEmail(payload.email) : null;
  } catch {
    return null;
  }
}

/* ---------- Apps, users ---------- */

const appRow = (r) => ({
  id: r.id, name: r.name, description: r.description, url: r.url, roles: JSON.parse(r.roles || '[]'),
  access_group_id: r.access_group_id, access_aud: r.access_aud, enabled: Boolean(r.enabled), sort: r.sort,
});

async function listApps(env, { all = false } = {}) {
  const { results } = await env.DB.prepare(`SELECT * FROM apps ${all ? '' : 'WHERE enabled = 1'} ORDER BY sort, name`).all();
  return results.map(appRow);
}

async function getApp(env, id) {
  const r = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
  return r ? appRow(r) : null;
}

const bootstrapAdmins = (env) => (env.ADMIN_EMAILS || '').split(',').map(normEmail).filter(Boolean);

async function loadUser(env, email) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const isBootstrap = bootstrapAdmins(env).includes(email);
  if (!user && !isBootstrap) return null;
  if (user && !user.active && !isBootstrap) return null;
  const { results } = await env.DB.prepare('SELECT app_id, role FROM app_access WHERE email = ?').bind(email).all();
  const apps = Object.fromEntries(results.map((r) => [r.app_id, r.role]));
  // Bootstrap admins (ADMIN_EMAILS) always get in and get every app's top role, so nobody gets locked out.
  if (isBootstrap) for (const a of await listApps(env)) apps[a.id] = a.roles[a.roles.length - 1] || 'admin';
  return { email, name: user?.name || '', admin: isBootstrap || Boolean(user?.is_admin), apps, bootstrap: isBootstrap };
}

// Throttled to one write per user per 10 minutes (apps call Directory.access on every request).
const touch = (env, email) => env.DB.prepare('UPDATE users SET last_seen_at = ?1 WHERE email = ?2 AND (last_seen_at IS NULL OR last_seen_at < ?3)')
  .bind(now(), email, new Date(Date.now() - 600_000).toISOString()).run();

async function currentUser(req, env) {
  const email = await accessEmail(req, env);
  if (!email) throw new HttpError(401, 'Not signed in. Open https://fortifygrid.com/dashboard/ to sign in.');
  const user = await loadUser(env, email);
  if (!user) throw new HttpError(403, `${email} has not been given access. Ask a FortifyGrid admin to add you.`);
  await touch(env, email);
  return user;
}

async function audit(env, actor, action, target = '', detail = '') {
  await env.DB.prepare('INSERT INTO audit (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(now(), actor, action, target, detail).run();
}

/* ---------- Cloudflare API (Access groups + apps) ----------
   CF_API_TOKEN (secret) needs Account · Access: Organizations, Identity Providers, and Groups · Edit and
   Account · Access: Apps and Policies · Edit. CF_ACCOUNT_ID is a var. */

const cfConfigured = (env) => Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID);

async function cf(env, path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID.trim()}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.CF_API_TOKEN.trim()}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new Error((data.errors || []).map((e) => e.message).join('; ') || `Cloudflare API ${res.status}`);
  return data.result;
}

async function putGroupEmails(env, groupId, emails) {
  const g = await cf(env, `/access/groups/${groupId}`);
  // Only email rules are managed here; other rule types added by hand (domains etc.) are kept.
  const include = [...(g.include || []).filter((r) => !r.email), ...[...new Set(emails)].sort().map((email) => ({ email: { email } }))];
  await cf(env, `/access/groups/${groupId}`, { method: 'PUT', body: { name: g.name, include, exclude: g.exclude || [], require: g.require || [] } });
}

// Dashboard group (PORTAL_GROUP_ID) = every active user; each app's group = active users with a role in it.
// ADMIN_EMAILS are always included so a group is never empty.
async function syncAccessGroups(env) {
  if (!cfConfigured(env)) return { synced: false, note: 'Access sync not configured (CF_API_TOKEN): add emails to the Access groups by hand.' };
  const admins = bootstrapAdmins(env);
  const { results: active } = await env.DB.prepare('SELECT email FROM users WHERE active = 1').all();
  const { results: grants } = await env.DB.prepare(
    'SELECT a.email, a.app_id FROM app_access a JOIN users u ON u.email = a.email WHERE u.active = 1').all();
  const jobs = [];
  if (env.PORTAL_GROUP_ID) jobs.push(['dashboard', env.PORTAL_GROUP_ID, [...admins, ...active.map((r) => r.email)]]);
  for (const app of await listApps(env, { all: true })) {
    if (app.access_group_id) jobs.push([app.id, app.access_group_id, [...admins, ...grants.filter((g) => g.app_id === app.id).map((g) => g.email)]]);
  }
  const errors = [];
  for (const [name, gid, emails] of jobs) {
    try { await putGroupEmails(env, gid, emails); } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  return errors.length
    ? { synced: false, note: `Access sync failed for ${errors.join('; ')}` }
    : { synced: true, note: `Access groups updated (${jobs.length}).` };
}

// Creates "<name> users" group + a self-hosted Access app for the host, allowing that group, with every login
// method (Google, email code). Returns { groupId, aud }.
async function provisionAccess(env, name, host) {
  const idps = (await cf(env, '/access/identity_providers')).map((i) => i.id);
  const groups = await cf(env, '/access/groups');
  const group = groups.find((g) => g.name === `${name} users`)
    || await cf(env, '/access/groups', { method: 'POST', body: { name: `${name} users`, include: bootstrapAdmins(env).map((email) => ({ email: { email } })) } });
  const body = {
    name, domain: host, type: 'self_hosted', session_duration: '24h', allowed_idps: idps,
    app_launcher_visible: false, http_only_cookie_attribute: true, same_site_cookie_attribute: 'lax',
    policies: [{ name: `${name} users`, decision: 'allow', include: [{ group: { id: group.id } }], precedence: 1 }],
  };
  const existing = (await cf(env, '/access/apps')).find((a) => a.domain === host);
  const app = existing
    ? await cf(env, `/access/apps/${existing.id}`, { method: 'PUT', body })
    : await cf(env, '/access/apps', { method: 'POST', body });
  return { groupId: group.id, aud: app.aud };
}

/* ---------- Invite email (optional) ----------
   With EMAIL_API_KEY (Resend secret) + EMAIL_FROM set, invites are sent from the Worker. Otherwise the admin page
   opens the same message in the admin's own mail app. */

async function sendInvite(env, email, grants) {
  const apps = (await listApps(env)).filter((a) => grants?.[a.id]);
  const subject = 'Your access to FortifyGrid apps';
  const list = apps.map((a) => `- ${a.name}: ${a.url}`).join('\n') || '- Dashboard: https://fortifygrid.com/dashboard/';
  const text = [
    'Hello,', '', 'You have been given access to FortifyGrid apps:', list, '',
    'How to sign in:',
    '1. Open https://fortifygrid.com/dashboard/',
    `2. Choose Google (if ${email} is a Google account) or enter ${email} to get a one-time code by email.`,
    '3. Open any app tile. No password is needed.', '', 'FortifyGrid',
  ].join('\n');
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) return { sent: false, subject, text };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], reply_to: env.EMAIL_REPLY_TO || undefined, subject, text }),
  });
  return res.ok ? { sent: true, subject, text } : { sent: false, error: `Email failed (${res.status})`, subject, text };
}

/* ---------- Admin: users ---------- */

async function listUsers(env) {
  const { results: users } = await env.DB.prepare('SELECT * FROM users ORDER BY email').all();
  const { results: grants } = await env.DB.prepare('SELECT email, app_id, role FROM app_access').all();
  return users.map((u) => ({
    email: u.email, name: u.name, is_admin: Boolean(u.is_admin), active: Boolean(u.active),
    last_seen_at: u.last_seen_at, created_at: u.created_at, bootstrap: bootstrapAdmins(env).includes(u.email),
    apps: Object.fromEntries(grants.filter((g) => g.email === u.email).map((g) => [g.app_id, g.role])),
  }));
}

async function saveUser(env, actor, body) {
  const email = normEmail(body.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const apps = {};
  for (const app of await listApps(env, { all: true })) {
    const role = body.apps?.[app.id];
    if (role && app.roles.includes(role)) apps[app.id] = role;
  }
  const isAdmin = body.is_admin ? 1 : 0;
  const active = body.active === false ? 0 : 1;
  if (email === actor.email && (!isAdmin || !active) && !actor.bootstrap) throw new HttpError(400, 'You cannot remove your own admin access.');
  const existed = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  const t = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (email, name, is_admin, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, is_admin = excluded.is_admin, active = excluded.active, updated_at = excluded.updated_at`)
      .bind(email, String(body.name || '').slice(0, 200), isAdmin, active, t, t),
    env.DB.prepare('DELETE FROM app_access WHERE email = ?').bind(email),
    ...Object.entries(apps).map(([appId, role]) =>
      env.DB.prepare('INSERT INTO app_access (email, app_id, role) VALUES (?, ?, ?)').bind(email, appId, role)),
  ]);
  await audit(env, actor.email, existed ? 'update user' : 'add user', email, JSON.stringify({ admin: Boolean(isAdmin), active: Boolean(active), apps }));
  const sync = await syncAccessGroups(env);
  let invite;
  if (!existed && body.invite) {
    invite = await sendInvite(env, email, apps);
    await audit(env, actor.email, 'invite', email, invite.sent ? 'sent' : 'manual');
  }
  return { ok: true, email, sync, invite };
}

async function deleteUser(env, actor, email) {
  if (email === actor.email) throw new HttpError(400, 'You cannot delete yourself.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM app_access WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email),
  ]);
  await audit(env, actor.email, 'delete user', email);
  return { ok: true, sync: await syncAccessGroups(env) };
}

/* ---------- Admin: apps ---------- */

async function saveApp(env, actor, body) {
  const id = String(body.id || '').trim().toLowerCase();
  if (!APP_ID_RE.test(id)) throw new HttpError(400, 'App id: lowercase letters, digits, dashes (e.g. "heatmap").');
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) throw new HttpError(400, 'App name is required.');
  let url;
  try { url = new URL(String(body.url || '')); } catch { throw new HttpError(400, 'Enter the app URL, e.g. https://heatmap.fortifygrid.com/'); }
  if (url.protocol !== 'https:') throw new HttpError(400, 'App URL must be https.');
  const roles = String(body.roles || 'viewer,admin').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (!roles.length || !roles.every((r) => ROLE_RE.test(r))) throw new HttpError(400, 'Roles: comma-separated words, lowest first (e.g. "viewer,admin").');
  const existing = await getApp(env, id);
  let groupId = existing?.access_group_id || String(body.access_group_id || '').trim();
  let aud = existing?.access_aud || '';
  let note = '';
  if (body.provision) {
    if (!cfConfigured(env)) throw new HttpError(400, 'CF_API_TOKEN is not set, so Cloudflare Access cannot be created from here.');
    try { ({ groupId, aud } = await provisionAccess(env, name, url.host)); note = 'Cloudflare Access app and group created.'; }
    catch (e) { throw new HttpError(502, `Cloudflare Access setup failed: ${e.message}`); }
  }
  const t = now();
  await env.DB.prepare(`INSERT INTO apps (id, name, description, url, roles, access_group_id, access_aud, enabled, sort, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, url = excluded.url, roles = excluded.roles,
        access_group_id = excluded.access_group_id, access_aud = excluded.access_aud, enabled = excluded.enabled, sort = excluded.sort,
        updated_at = excluded.updated_at`)
    .bind(id, name, String(body.description || '').slice(0, 300), url.href, JSON.stringify(roles), groupId, aud,
      body.enabled === false ? 0 : 1, Number(body.sort) || 0, t, t).run();
  // Roles that no longer exist are dropped from users.
  await env.DB.prepare(`DELETE FROM app_access WHERE app_id = ? AND role NOT IN (SELECT value FROM json_each(?))`).bind(id, JSON.stringify(roles)).run();
  await audit(env, actor.email, existing ? 'update app' : 'add app', id, JSON.stringify({ name, url: url.href, roles, enabled: body.enabled !== false }));
  const sync = groupId ? await syncAccessGroups(env) : undefined;
  return { ok: true, id, note, sync, aud };
}

/* ---------- Admin: tabs per role ---------- */

async function listTabs(env) {
  const { results: tabs } = await env.DB.prepare('SELECT app_id, tab, label, sort FROM app_tabs ORDER BY app_id, sort, tab').all();
  const { results: grants } = await env.DB.prepare('SELECT app_id, role, tab FROM role_tabs').all();
  return { tabs, grants };
}

// body: { tabs?: [{tab, label}], role_tabs: { <role>: [tab, ...] } }. Replaces the app's tab grants.
async function saveTabs(env, actor, appId, body) {
  const app = await getApp(env, appId);
  if (!app) throw new HttpError(404, 'No such app.');
  const stmts = [];
  if (Array.isArray(body.tabs)) {
    const defs = body.tabs.map((t, i) => ({ tab: String(t.tab || '').trim().toLowerCase(), label: String(t.label || t.tab || '').slice(0, 80), sort: i }))
      .filter((t) => SETTING_KEY_RE.test(t.tab));
    stmts.push(env.DB.prepare('DELETE FROM app_tabs WHERE app_id = ?').bind(appId),
      ...defs.map((t) => env.DB.prepare('INSERT INTO app_tabs (app_id, tab, label, sort) VALUES (?, ?, ?, ?)').bind(appId, t.tab, t.label, t.sort)));
  }
  const known = Array.isArray(body.tabs)
    ? new Set(body.tabs.map((t) => String(t.tab || '').trim().toLowerCase()))
    : new Set((await env.DB.prepare('SELECT tab FROM app_tabs WHERE app_id = ?').bind(appId).all()).results.map((r) => r.tab));
  stmts.push(env.DB.prepare('DELETE FROM role_tabs WHERE app_id = ?').bind(appId));
  for (const [role, tabs] of Object.entries(body.role_tabs || {})) {
    if (!app.roles.includes(role) || !Array.isArray(tabs)) continue;
    for (const tab of new Set(tabs)) if (known.has(tab)) stmts.push(env.DB.prepare('INSERT INTO role_tabs (app_id, role, tab) VALUES (?, ?, ?)').bind(appId, role, tab));
  }
  await env.DB.batch(stmts);
  await audit(env, actor.email, 'set tabs', appId, JSON.stringify(body.role_tabs || {}).slice(0, 300));
  return { ok: true };
}

/* ---------- Admin: settings ---------- */

async function listSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value, updated_at, updated_by FROM settings ORDER BY key').all();
  return results;
}

async function saveSetting(env, actor, body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!SETTING_KEY_RE.test(key)) throw new HttpError(400, 'Setting key: lowercase letters, digits, underscores.');
  const value = String(body.value ?? '').slice(0, 4000);
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(key, value, now(), actor.email).run();
  await audit(env, actor.email, 'set setting', key, value.slice(0, 200));
  return { ok: true, key };
}

async function deleteSetting(env, actor, key) {
  await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  await audit(env, actor.email, 'delete setting', key);
  return { ok: true };
}

/* ---------- Router ---------- */

async function api(req, env, url) {
  const user = await currentUser(req, env);
  const path = url.pathname.replace(/^\/dashboard\/api\//, '').replace(/\/+$/, '');
  const method = req.method;

  // Writes must come from our own pages (blocks cross-site form posts riding the Access cookie).
  if (method !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Cross-origin request refused.');
    if (method !== 'DELETE' && !(req.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Send JSON.');
  }

  if (path === 'me' && method === 'GET') {
    const apps = (await listApps(env)).filter((a) => user.apps[a.id])
      .map(({ id, name, description, url: u }) => ({ id, name, description, url: u, role: user.apps[id] }));
    const notice = await env.DB.prepare("SELECT value FROM settings WHERE key = 'dashboard_notice'").first();
    return json({ email: user.email, name: user.name, admin: user.admin, apps, notice: notice?.value || '' });
  }

  if (!path.startsWith('admin/')) throw new HttpError(404, 'Not found');
  if (!user.admin) throw new HttpError(403, 'Admins only.');
  const [, resource, rawId, sub] = path.split('/');
  const id = rawId ? decodeURIComponent(rawId) : '';
  const body = method === 'GET' || method === 'DELETE' ? {} : await req.json().catch(() => ({}));

  if (resource === 'overview' && method === 'GET') {
    let logins = [];
    if (cfConfigured(env)) {
      try { logins = (await cf(env, '/access/identity_providers')).map((i) => ({ type: i.type, name: i.name })); } catch { /* shown as unknown */ }
    }
    return json({
      users: await listUsers(env), apps: await listApps(env, { all: true }), settings: await listSettings(env), tabs: await listTabs(env),
      access_sync: cfConfigured(env), email_invites: Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM),
      team_domain: teamDomain(env), logins,
    });
  }
  if (resource === 'users') {
    if (method === 'POST' && !id) return json(await saveUser(env, user, body));
    if (method === 'DELETE' && id) return json(await deleteUser(env, user, normEmail(id)));
    if (method === 'POST' && id && sub === 'invite') {
      const target = await loadUser(env, normEmail(id));
      if (!target) throw new HttpError(404, 'No such user.');
      const invite = await sendInvite(env, target.email, target.apps);
      await audit(env, user.email, 'invite', target.email, invite.sent ? 'sent' : 'manual');
      return json({ ok: true, invite });
    }
  }
  if (resource === 'apps' && method === 'POST' && !id) return json(await saveApp(env, user, body));
  if (resource === 'apps' && method === 'POST' && id && sub === 'tabs') return json(await saveTabs(env, user, id, body));
  if (resource === 'settings') {
    if (method === 'POST' && !id) return json(await saveSetting(env, user, body));
    if (method === 'DELETE' && id) return json(await deleteSetting(env, user, id));
  }
  if (resource === 'sync' && method === 'POST') {
    const sync = await syncAccessGroups(env);
    await audit(env, user.email, 'sync', '', sync.note);
    return json(sync);
  }
  if (resource === 'audit' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all();
    return json(results);
  }
  throw new HttpError(404, 'Not found');
}

/* ---------- Directory RPC for app Workers (service binding only, not reachable from the internet) ---------- */

export class Directory extends WorkerEntrypoint {
  // What an app needs to verify Access logins itself: { team_domain, aud } or null if the app is unknown/disabled.
  async config(appId) {
    const app = await getApp(this.env, appId);
    if (!app || !app.enabled || !app.access_aud) return null;
    return { team_domain: teamDomain(this.env), aud: app.access_aud };
  }

  // Tabs the caller may see in appId (array of tab ids). Bootstrap admins see every tab.
  async tabs(email, appId) {
    const user = await loadUser(this.env, normEmail(email));
    const role = user?.apps[appId];
    if (!role) return [];
    const q = user.bootstrap
      ? this.env.DB.prepare('SELECT tab FROM app_tabs WHERE app_id = ?').bind(appId)
      : this.env.DB.prepare('SELECT tab FROM role_tabs WHERE app_id = ? AND role = ?').bind(appId, role);
    return (await q.all()).results.map((r) => r.tab);
  }

  // The caller's role in appId (one of the app's roles) or null.
  async access(email, appId) {
    const app = await getApp(this.env, appId);
    if (!app || !app.enabled) return null;
    const user = await loadUser(this.env, normEmail(email));
    if (!user) return null;
    await touch(this.env, user.email);
    return user.apps[appId] || null;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // One canonical host: Access protects fortifygrid.com/dashboard, not www.
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith('/dashboard/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        if (e instanceof HttpError) return json({ message: e.message }, e.status);
        console.error(e);
        return json({ message: 'Server error' }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
