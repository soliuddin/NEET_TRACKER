/* NEET Tracker service worker — app-shell caching for offline support.
   Bump CACHE_NAME whenever index.html/manifest/icons change so returning
   visitors pick up the new version instead of a stale cached copy. */
const CACHE_NAME = 'neet-tracker-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/favicon-48.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache Firestore/Auth traffic — that must always hit the network
  // live, or the whole point of "live sync" breaks.
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseio.com')) {
    return;
  }

  // App-shell files: cache-first (instant load, works offline), but refresh
  // the cache in the background whenever the network succeeds.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Third-party assets (Google Fonts etc.): network-first, fall back to
  // cache if offline.
  event.respondWith(
    fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
