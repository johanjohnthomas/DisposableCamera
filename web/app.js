import { config } from './config.js';
import { configured, demo, session, auth, rpc, request, objectPath, photoBlob } from './api.js';
import { read, write } from './local-store.js';
import { filters, startCamera, stopCamera, capture, cameraError } from './camera.js';
import { clearGallery, addPhoto, initDialog } from './gallery.js';
const $ = selector => document.querySelector(selector);
let state, pending, filterIndex = 0, busy = false, cameraReady = false;
const scope = () => demo ? 'demo' : `${config.supabaseUrl}:${session()?.user.id}`;
const pendingKey = () => `pending:${scope()}`;
const status = (message, error = false) => { $('#camera-status').textContent = message; $('#camera-status').classList.toggle('error', error); };
const page = name => { for (const id of ['welcome', 'session', 'gallery']) $(`#${id}`).hidden = id !== name; window.scrollTo(0, 0); };
function controls() {
  $('#remaining').textContent = String(state?.remaining_count ?? 10).padStart(2, '0');
  $('#roll-count').textContent = state?.finalized_count ?? 0;
  $('#shutter').disabled = busy || !cameraReady || Boolean(pending) || state?.remaining_count <= 0;
  $('#filter-button').disabled = busy || Boolean(pending);
  $('#roll-button').disabled = busy;
  $('#retry-upload').hidden = !pending || busy;
  $('#film-strip').replaceChildren(...Array.from({ length: 10 }, (_, i) => {
    const cell = document.createElement('span'); cell.className = `film-cell${i < state.reserved_count ? ' filled' : ''}`;
    cell.textContent = String(i + 1).padStart(2, '0');
    cell.setAttribute('aria-label', `Frame ${i + 1}, ${i < state.finalized_count ? 'saved' : i < state.reserved_count ? 'reserved' : 'available'}`);
    return cell;
  }));
}
async function refreshState() {
  if (demo) {
    const guest = await read('demo:guest'); const shots = await read('demo:shots') || [];
    state = { username: guest, shots, reserved_count: shots.length, finalized_count: shots.length, remaining_count: 10 - shots.length };
  } else state = await rpc('get_camera_state');
  controls();
}
async function enableCamera() {
  $('#retry-camera').hidden = true; cameraReady = false; controls();
  status('Opening your camera…');
  try {
    await startCamera($('#video')); cameraReady = true;
    $('#camera-idle').hidden = true; $('#live-label').hidden = false;
    status(pending ? 'One photo still needs to be saved. Tap Retry saving photo.' : state.remaining_count ? 'Camera ready.' : 'All 10 photos used.');
  } catch (error) { status(cameraError(error), true); $('#retry-camera').hidden = false; }
  controls();
}
async function openCamera() {
  await refreshState();
  pending = await read(pendingKey());
  $('#guest-name').textContent = state.username;
  $('#active-camera').append($('#camera-mount')); page('session');
  if (state.remaining_count === 0 && !pending) {
    cameraReady = false; stopCamera($('#video')); $('#camera-idle').hidden = false;
    status('All 10 photos used.'); controls();
  } else await enableCamera();
}
$('#join-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('#username').value.trim();
  if (!name) { $('#join-status').textContent = 'Enter your name.'; return; }
  $('#join').disabled = true; $('#join-status').textContent = 'Opening camera…';
  try {
    if (demo) await write('demo:guest', name);
    else { if (!session()) await auth('signup', { data: {} }); await rpc('register_guest', { p_username: name }); }
    await openCamera();
  } catch (error) { $('#join-status').textContent = error.message; }
  finally { $('#join').disabled = !configured && !demo; }
});
async function savePending() {
  if (!pending) return;
  if (demo) {
    const shots = await read('demo:shots') || [];
    if (!shots.some(shot => shot.reservation_id === pending.requestId)) {
      if (shots.length >= 10) throw new Error('All 10 photos used.');
      shots.push({ reservation_id: pending.requestId, slot_number: shots.length + 1, blob: pending.blob, filter_name: pending.filter, created_at: pending.createdAt });
      await write('demo:shots', shots);
    }
  } else {
    const reserved = await rpc('reserve_shot', { p_request_id: pending.requestId, p_filter: pending.filter });
    const shot = Array.isArray(reserved) ? reserved[0] : reserved;
    try {
      await request(`/storage/v1/object/event-photos/${objectPath(shot.object_path)}`, { method: 'POST', body: pending.blob });
    } catch (error) {
      // A previous upload may have reached storage even when its response was lost.
      // Finalization independently proves the reserved object exists.
      try { await rpc('finalize_shot', { p_reservation_id: shot.reservation_id }); }
      catch { throw error; }
    }
    await rpc('finalize_shot', { p_reservation_id: shot.reservation_id });
  }
  await write(pendingKey(), undefined); pending = undefined;
  await refreshState();
  status(state.remaining_count ? `Saved${demo ? ' on this device' : ''}. ${state.remaining_count} ${state.remaining_count === 1 ? 'photo' : 'photos'} left.` : 'All 10 photos used.');
  if (!state.remaining_count) { stopCamera($('#video')); cameraReady = false; $('#live-label').hidden = true; }
}
async function takePhoto(retry = false) {
  if (busy) return;
  busy = true; controls();
  try {
    const work = async () => {
      // Re-read inside a cross-tab lock, preserving any unresolved photo first.
      pending = await read(pendingKey()) || pending;
      if (!pending && retry) { await refreshState(); return; }
      if (!pending) {
        await refreshState();
        if (!state.remaining_count) { status('All 10 photos used. Open Photos to view them.'); return; }
        const blob = await capture($('#video'), filters[filterIndex].key);
        pending = { requestId: crypto.randomUUID(), blob, filter: filters[filterIndex].key, createdAt: new Date().toISOString() };
        await write(pendingKey(), pending);
        $('#shutter-flash').classList.remove('firing'); requestAnimationFrame(() => $('#shutter-flash').classList.add('firing'));
      }
      await write(pendingKey(), pending);
      status(demo ? 'Saving photo…' : 'Saving photo…');
      await savePending();
    };
    if (navigator.locks) await navigator.locks.request(`capture:${scope()}`, work);
    else throw new Error('Update Safari or Chrome to safely save your camera roll.');
  } catch (error) { status(pending ? `Photo not saved yet. ${error.message} Your photo is kept here for retry.` : `Couldn’t take a photo. ${error.message}`, true); }
  finally {
    busy = false; controls();
    if (!document.hidden && !$('#session').hidden && !cameraReady && state.remaining_count > 0) await enableCamera();
  }
}
$('#shutter').onclick = () => takePhoto();
$('#retry-upload').onclick = () => takePhoto(true);
$('#retry-camera').onclick = enableCamera;
$('#filter-button').onclick = () => {
  filterIndex = (filterIndex + 1) % filters.length;
  const filter = filters[filterIndex];
  $('#video').style.filter = filter.css; $('#filter-name').textContent = filter.name; $('#film-label').textContent = filter.name.toUpperCase();
  status(`${filter.name} film selected.`);
};
$('#roll-button').onclick = async () => {
  stopCamera($('#video')); cameraReady = false; page('gallery');
  clearGallery($('#photo-grid')); $('#gallery-status').textContent = 'Loading photos…';
  try {
    await refreshState();
    $('#gallery-subtitle').textContent = `${state.finalized_count} of 10 photos${demo ? ' · Saved on this device' : ' · Shared with your host'}`;
    const shots = state.shots.filter(shot => demo || shot.status === 'finalized');
    if (!shots.length) { const empty = document.createElement('p'); empty.className = 'empty-roll'; empty.textContent = 'No photos yet.'; $('#photo-grid').append(empty); }
    for (const shot of shots) await addPhoto($('#photo-grid'), shot, value => demo ? value.blob : photoBlob(value.object_path));
    $('#gallery-status').textContent = '';
  } catch (error) { $('#gallery-status').textContent = error.message; }
};
$('#back-camera').onclick = () => { clearGallery($('#photo-grid')); openCamera().catch(error => { $('#gallery-status').textContent = error.message; }); };
initDialog();
for (const label of document.querySelectorAll('[data-event]')) label.textContent = config.eventName;
$('#demo-banner').hidden = !demo; $('#setup-note').hidden = configured || demo; $('#join').disabled = !configured && !demo;
window.addEventListener('offline', () => status('You’re offline. A captured photo stays here until you retry saving online.', true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopCamera($('#video')); cameraReady = false; if (state) controls(); }
  else if (state && !$('#session').hidden && state.remaining_count && !busy) enableCamera();
});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; $('#install-footer').hidden = false; });
$('#install').onclick = async () => { await installPrompt?.prompt(); $('#install').hidden = true; $('#install-footer').hidden = true; };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
(async () => {
  try { if (demo ? await read('demo:guest') : configured && session()) await openCamera(); }
  catch (error) { $('#join-status').textContent = `Couldn’t restore your camera. ${error.message}`; }
})();
