// Shared helpers for the signed-in portal pages.
export async function api(path, opts = {}) {
  const res = await fetch(`/dashboard/api/${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function showMsg(el, text, kind = '') {
  el.className = `msg ${kind}`;
  el.textContent = text;
  el.hidden = !text;
}
