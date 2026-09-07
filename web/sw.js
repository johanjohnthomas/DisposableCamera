const CACHE = 'tenframes-shell-v2';
const SHELL = ['./', './index.html', './style.css', './display.ttf', './app.js', './api.js', './camera.js', './local-store.js', './gallery.js', './download.js', './config.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tenframes-shell-') && key !== CACHE).map(key => caches.delete(key))))); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const allowed = SHELL.map(path => new URL(path, self.registration.scope).pathname);
  if (!allowed.includes(url.pathname)) return;
  // Network first keeps configuration fresh; only the public app shell is cached.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
