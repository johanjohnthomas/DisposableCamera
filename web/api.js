import { config } from './config.js';
export const configured = /^https:\/\/[a-z0-9.-]+$/.test(config.supabaseUrl) && Boolean(config.supabaseKey);
export const demo = new URLSearchParams(location.search).get('demo') === '1';
const prefix = `tenframes:${config.supabaseUrl}:`;
let refreshing;
export function session(kind = 'guest') {
  try { return JSON.parse(localStorage.getItem(prefix + kind) || 'null'); } catch { return null; }
}
function saveSession(value, kind) {
  const stored = { ...value, expires_at: Date.now() + value.expires_in * 1000 };
  localStorage.setItem(prefix + kind, JSON.stringify(stored));
  return stored;
}
export async function auth(path, body, kind = 'guest') {
  if (!configured) throw new Error('The host needs to connect this event first.');
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.msg || result.error_description || result.message || 'Sign-in failed. Please try again.');
  return saveSession(result, kind);
}
async function accessToken(kind) {
  let current = session(kind);
  if (!current) throw new Error('Your session is missing. Please sign in again.');
  if (current.expires_at < Date.now() + 60000) {
    // Each page has only one role in flight, so concurrent gallery requests share refresh.
    refreshing ??= auth('token?grant_type=refresh_token', { refresh_token: current.refresh_token }, kind).finally(() => { refreshing = null; });
    current = await refreshing;
  }
  return current.access_token;
}
export async function request(path, { method = 'GET', body, kind = 'guest', binary = false } = {}) {
  const token = await accessToken(kind);
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method, headers: { apikey: config.supabaseKey, Authorization: `Bearer ${token}`, ...(body instanceof Blob ? { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' } : { 'Content-Type': 'application/json' }) },
    body: body instanceof Blob ? body : body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.message || result.msg || result.error || `Request failed (${response.status}). Please retry.`);
    error.status = response.status;
    error.code = result.error || result.code;
    throw error;
  }
  return binary ? response.blob() : response.status === 204 ? null : response.json();
}
export const rpc = (name, body = {}, kind = 'guest') => request(`/rest/v1/rpc/${name}`, { method: 'POST', body, kind });
export async function signOut() {
  try { await request('/auth/v1/logout', { method: 'POST', kind: 'admin' }); }
  finally { localStorage.removeItem(prefix + 'admin'); }
}
export const objectPath = (path) => path.split('/').map(encodeURIComponent).join('/');
export const photoBlob = (path, kind = 'guest') => request(`/storage/v1/object/authenticated/event-photos/${objectPath(path)}`, { binary: true, kind });
