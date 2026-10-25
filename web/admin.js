import { config } from './config.js';
import { configured, session, auth, rpc, photoBlob, signOut } from './api.js';
import { addPhoto, clearGallery, initDialog } from './gallery.js';
import { makeZip } from './zip.js';
import { download } from './download.js';
const $ = selector => document.querySelector(selector);
let shots = [], loading = false, renderVersion = 0;
const filtered = () => shots.filter(shot => shot.username.toLocaleLowerCase().includes($('#search').value.toLocaleLowerCase().trim()));
function status(text) { $('#admin-status').textContent = text; }
async function render() {
  const version = ++renderVersion;
  clearGallery($('#photo-grid'));
  const shown = filtered(); $('#photo-count').textContent = `${shown.length} ${shown.length === 1 ? 'photo' : 'photos'} loaded`;
  $('#download-all').disabled = !shots.length;
  if (!shown.length) { const empty = document.createElement('p'); empty.className = 'empty-roll'; empty.textContent = shots.length ? 'No guests match that name.' : 'No photos yet.'; $('#photo-grid').append(empty); }
  for (let i = 0; i < shown.length; i += 4) {
    if (version !== renderVersion) return;
    await Promise.all(shown.slice(i, i + 4).map(shot => addPhoto($('#photo-grid'), shot, value => photoBlob(value.object_path, 'admin'), { admin: true })));
  }
}
// The server pages results 50 at a time, so keep asking until a short page signals the end.
async function fetchAll() {
  const all = [];
  for (let page; !page || page.length === 50;) {
    status(`Loading photos… ${all.length} so far`);
    page = (await rpc('list_event_photos', { p_offset: all.length, p_limit: 50 }, 'admin')).photos; all.push(...page);
  }
  return all;
}
async function load() {
  if (loading) return;
  loading = true; $('#refresh').disabled = true;
  try { shots = await fetchAll(); status('All event photos are loaded.'); await render(); }
  catch (error) { status(error.message); }
  finally { loading = false; $('#refresh').disabled = false; }
}
async function enter() {
  if (!await rpc('is_event_admin', {}, 'admin')) throw new Error('This account doesn’t have host access. Ask the event owner to add it as an admin.');
  $('#admin-login').hidden = true; $('#admin-gallery').hidden = false; await load();
}
$('#admin-form').onsubmit = async event => {
  event.preventDefault(); $('#sign-in').disabled = true; $('#login-status').textContent = 'Signing in…';
  try { await auth('token?grant_type=password', { email: $('#email').value.trim(), password: $('#password').value }, 'admin'); $('#password').value = ''; await enter(); }
  catch (error) { $('#login-status').textContent = error.message; }
  finally { $('#sign-in').disabled = false; }
};
$('#sign-out').onclick = async () => {
  ++renderVersion; clearGallery($('#photo-grid')); $('#photo-dialog').close(); $('#detail-photo').removeAttribute('src'); $('#download-photo').removeAttribute('href'); shots = [];
  try { await signOut(); } catch { /* Local session is cleared even if the server cannot be reached. */ }
  $('#admin-login').hidden = false; $('#admin-gallery').hidden = true; $('#login-status').textContent = 'You’re signed out.';
};
let searchTimer;
$('#search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(render, 200); };
$('#refresh').onclick = () => load();
$('#download-all').onclick = async () => {
  $('#download-all').disabled = true;
  try {
    // Re-fetch so photos taken since the gallery last loaded are included too.
    const all = await fetchAll();
    const query = $('#search').value.toLocaleLowerCase().trim(), selected = all.filter(shot => shot.username.toLocaleLowerCase().includes(query));
    if (!selected.length) { status(query ? 'No guests match that name.' : 'No photos yet.'); return; }
    const files = [];
    for (const shot of selected) {
      status(`Preparing photo ${files.length + 1} of ${selected.length}…`);
      files.push({ name: `${shot.username.replace(/[^a-z0-9_-]/gi, '_')}-${shot.reservation_id}-${shot.slot_number}.jpg`, blob: await photoBlob(shot.object_path, 'admin') });
    }
    status('Building zip…');
    await download(await makeZip(files), 'tenframes.zip');
    status(`Download ready with ${selected.length} ${selected.length === 1 ? 'photo' : 'photos'}.`);
  } catch (error) { status(`Download failed: ${error.message} You can retry.`); }
  finally { $('#download-all').disabled = !shots.length; }
};
initDialog(); $('#event-title').textContent = config.eventName;
if (!configured) { $('#sign-in').disabled = true; $('#login-status').textContent = 'Connect your Supabase project in config.js to enable host sign-in.'; }
else if (session('admin')) enter().catch(error => { $('#login-status').textContent = error.message; });
