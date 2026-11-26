// Service worker: makes the game installable as an app and playable offline.
// Network first, so a new version on the site always wins; the last copy of every file
// (the game, libraries from the CDN, fonts) is kept for when there is no connection.
const CACHE = 'coldbore-v3';
const CACHED_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'js/main.js', 'js/data.js', 'js/world.js', 'js/tex.js', 'js/guns.js', 'js/soldier.js', 'js/gore.js', 'js/fx.js', 'js/viewmodel.js', 'js/combat.js', 'js/weapons.js', 'js/bots.js', 'js/net.js', 'js/lobby.js', 'js/relay.js', 'js/input.js', 'js/audio.js', 'js/post.js', 'js/props.js', 'perf.js', 'sync.js', 'install.js', 'sounds/sounds.json'])).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin && !CACHED_HOSTS.includes(url.hostname)) return;
  const key = url.origin === self.location.origin ? req.url.split('?')[0] : req.url;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
