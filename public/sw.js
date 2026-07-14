// sw.js — offline-first service worker for Moto Rush X3.
// version.js is the single source of truth for the release and cache name.
importScripts('./version.js');

const CACHE = self.MOTO_RUSH_BUILD.cacheName;
const CACHE_PREFIX = self.MOTO_RUSH_BUILD.cachePrefix;
const PRECACHE = Object.freeze([
  './',
  './index.html',
  './game.js',
  './logic.js',
  './rules.js',
  './replay.js',
  './kinematics.js',
  './force-zones.js',
  './ragdoll.js',
  './debug-proxies.js',
  './run-session.js',
  './effect-pool.js',
  './input-state.js',
  './perf-metrics.js',
  './golden-tapes.json',
  './physics.js',
  './levels.js',
  './strings.js',
  './version.js',
  './manifest.json',
  './assets/sky.jpg',
  './assets/dirt.png',
  './assets/rock.png',
  './assets/bike.png',
  './assets/bike_body.png',
  './assets/wheel.png',
  './assets/barrel.png',
  './assets/saw.png',
  './assets/spikes.png',
  './assets/checkpoint.png',
  './assets/finish.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/music_menu.m4a',
  './assets/music_drive.m4a',
]);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
      .map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// cache-first, fall back to network and populate the cache at runtime
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && new URL(req.url).origin === location.origin) {
        await c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
