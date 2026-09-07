import { config } from './config.js';
import { configured, session, auth, rpc, photoBlob, signOut } from './api.js';
import { addPhoto, clearGallery, initDialog } from './gallery.js';
import { makeZip } from './zip.js';
import { download } from './download.js';
const $ = selector => document.querySelector(selector);
let shots = [], more = false, loading = false, renderVersion = 0;
const filtered = () => shots.filter(shot => shot.username.toLocaleLowerCase().includes($('#search').value.toLocaleLowerCase().trim()));
function status(text) { $('#admin-status').textContent = text; }
async function render() {
  const version = ++renderVersion;
  clearGallery($('#photo-grid'));
  const shown = filtered(); $('#photo-count').textContent = `${shown.length} ${shown.length === 1 ? 'photo' : 'photos'} loaded`;
  $('#download-all').disabled = !shown.length;
  if (!shown.length) { const empty = document.createElement('p'); empty.className = 'empty-roll'; empty.textContent = shots.length ? 'No guests match that name.' : 'The first memories will appear here once your guests start shooting.'; $('#photo-grid').append(empty); }
  for (let i = 0; i < shown.length; i += 4) {
    if (version !== renderVersion) return;
    await Promise.all(shown.slice(i, i + 4).map(shot => addPhoto($('#photo-grid'), shot, value => photoBlob(value.object_path, 'admin'), { admin: true })));
  }
}
async function load(reset = true) {
  if (loading) return;
  loading = true; $('#load-more').disabled = true; $('#refresh').disabled = true; status('Loading the contact sheet…');
  try {
    const result = await rpc('list_event_photos', { p_offset: reset ? 0 : shots.length, p_limit: 50 }, 'admin');
    shots = reset ? result.photos : [...shots, ...result.photos];
    more = result.photos.length === 50; $('#load-more').hidden = !more;
    await render(); status(more ? 'Load more to include the next 50 photos in your contact sheet.' : 'All event photos are loaded.');
  } catch (error) { status(error.message); }
  finally { loading = false; $('#load-more').disabled = false; $('#refresh').disabled = false; }
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
$('#refresh').onclick = () => load(); $('#load-more').onclick = () => load(false);
$('#download-all').onclick = async () => {
  const selected = filtered(); $('#download-all').disabled = true;
  try {
    // Small batches cap memory on phones and avoid a single event-sized archive.
    for (let start = 0; start < selected.length; start += 50) {
      const files = [];
      for (const shot of selected.slice(start, start + 50)) {
        status(`Preparing photo ${start + files.length + 1} of ${selected.length}…`);
        files.push({ name: `${shot.username.replace(/[^a-z0-9_-]/gi, '_')}-${shot.reservation_id}-${shot.slot_number}.jpg`, blob: await photoBlob(shot.object_path, 'admin') });
      }
      await download(await makeZip(files), `tenframes-${Math.floor(start / 50) + 1}.zip`);
    }
    status('Download ready. For several archives, allow multiple downloads in your browser.');
  } catch (error) { status(`Download failed: ${error.message} You can retry.`); }
  finally { $('#download-all').disabled = false; }
};
initDialog(); $('#event-title').textContent = config.eventName;
if (!configured) { $('#sign-in').disabled = true; $('#login-status').textContent = 'Connect your Supabase project in config.js to enable host sign-in.'; }
else if (session('admin')) enter().catch(error => { $('#login-status').textContent = error.message; });
