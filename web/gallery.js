import { download } from './download.js';
const urls = new Set();
export function clearGallery(grid) {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  grid.replaceChildren();
}
export async function addPhoto(grid, shot, getBlob, { admin = false } = {}) {
  const card = document.createElement('article'); card.className = 'photo-card';
  const figure = document.createElement('figure');
  const button = document.createElement('button'); button.setAttribute('aria-label', `Open photo ${shot.slot_number}${admin ? ` by ${shot.username}` : ''}`);
  const caption = document.createElement('figcaption');
  const name = document.createElement('span'); name.textContent = admin ? shot.username : `FRAME ${String(shot.slot_number).padStart(2, '0')}`;
  const number = document.createElement('span'); number.textContent = admin ? `#${String(shot.slot_number).padStart(2, '0')}` : new Date(shot.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  caption.append(name, number); figure.append(button, caption); card.append(figure); grid.append(card);
  button.textContent = 'Loading photo…'; button.className = 'loading-photo'; button.disabled = true;
  try {
    const blob = await getBlob(shot);
    const url = URL.createObjectURL(blob); urls.add(url);
    const img = document.createElement('img'); img.src = url; img.alt = `Frame ${shot.slot_number}${admin ? ` by ${shot.username}` : ' from your roll'}`; img.width = 800; img.height = 600;
    button.replaceChildren(img); button.className = ''; button.disabled = false;
    button.onclick = () => {
      document.querySelector('#detail-photo').src = url;
      const link = document.querySelector('#download-photo'); link.href = url;
      link.download = `tenframes-${(shot.username || 'photo').replace(/[^a-z0-9_-]/gi, '_')}-${shot.slot_number}.jpg`;
      link.onclick = async event => {
        if (!window.DisposableCameraDownloads) return;
        event.preventDefault(); link.textContent = 'Saving…';
        try { await download(blob, link.download); link.textContent = 'Saved'; }
        catch (error) { link.textContent = error.message; }
      };
      link.textContent = 'Save photo';
      document.querySelector('#photo-dialog').showModal();
    };
  } catch {
    button.textContent = 'Photo couldn’t load. Tap to retry.'; button.disabled = false;
    button.onclick = async () => { card.remove(); await addPhoto(grid, shot, getBlob, { admin }); };
  }
}
export function initDialog() {
  const dialog = document.querySelector('#photo-dialog');
  dialog.querySelector('.dialog-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
