// Знаменосци: прост service worker, за да се инсталира като приложение.
// Мрежата е първа (играта е онлайн), а кешът е резерва за основните файлове.
const CACHE = 'znamenostsi-v7';
const SHELL = ['/', '/style.css', '/client.js', '/logo.svg', '/logo-xmas.svg', '/season.js', '/design.js', '/map.json', '/neighbors.json', '/icon-192.png',
  '/v2/tokens.css', '/v2/components.css', '/v2/screens.css', '/v2/map3d.css', '/v2/map3d.js', '/v2/v2.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/admin') || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
