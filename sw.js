// Task Planner Service Worker
const CACHE_VERSION = 'v28';
const CACHE_NAME = `task-planner-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './task-scheduler.html',
  './manifest.json',
  './icon.svg',
  './task-data.json',
];

// ── Install: precache all assets ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Use allSettled so a missing icon/json doesn't abort install
      Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          fetch(url, { cache: 'no-cache' })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith('task-planner-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for assets, stale-while-revalidate for HTML ────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET over http(s)
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Cache-first for same-origin assets
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(networkRes => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return networkRes;
        })
        .catch(() => null);

      if (cached) {
        // Serve from cache immediately; update cache in background
        networkFetch.catch(() => {});
        return cached;
      }

      // Not cached yet — wait for network
      return networkFetch.then(res => {
        if (res) return res;
        // Offline fallback: serve the app shell
        if (request.mode === 'navigate') {
          return caches.match('./task-scheduler.html');
        }
        return new Response('{ "error": "offline" }', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    })
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();

  // Client can ask SW to cache a fresh copy of task-data.json
  if (event.data === 'syncTaskData') {
    caches.open(CACHE_NAME).then(cache =>
      fetch('./task-data.json', { cache: 'no-cache' })
        .then(res => { if (res.ok) cache.put('./task-data.json', res); })
        .catch(() => {})
    );
  }
});
