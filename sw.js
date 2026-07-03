// sw.js — offline-first service worker for Moto Rush X3.
// Bump CACHE on any asset/code change to invalidate old caches.
const CACHE = 'moto-rush-x3-v1.1.0';
const CORE = [
  './', './index.html', './game.js', './physics.js', './levels.js', './strings.js',
  './manifest.json',
  './assets/sky.jpg', './assets/dirt.png', './assets/rock.png', './assets/bike.png',
  './assets/wheel.png', './assets/barrel.png', './assets/saw.png', './assets/spikes.png',
  './assets/checkpoint.png', './assets/finish.png',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable.png',
];
// best-effort (may not exist yet): music
const OPTIONAL = ['./assets/music_menu.m4a', './assets/music_drive.m4a'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.allSettled(OPTIONAL.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// cache-first, fall back to network and populate the cache at runtime
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && new URL(req.url).origin === location.origin) {
        const c = await caches.open(CACHE); c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
