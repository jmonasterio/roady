// Service Worker - Network-First Strategy
// Works great for both development and production!
// No manual version bumping needed - always fetches latest from network

const CACHE_NAME = 'roady-v1';
const RUNTIME_CACHE = 'roady-runtime';

// Install - activate immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate - clean up old caches and take control
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - Network first, cache fallback (best for development!)
self.addEventListener('fetch', event => {
  const req = event.request;

  // Cache API only supports GET — never intercept mutations (POST/PUT/DELETE),
  // or `cache.put` throws "Request method 'X' is unsupported".
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never cache API / proxy traffic — it's authed and dynamic; serving a
  // stale cached copy would hand back another user's / expired data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__api__/')) {
    return;
  }

  // Skip cross-origin requests except CDN
  if (!req.url.startsWith(self.location.origin) &&
    !req.url.includes('cdn.jsdelivr.net')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses for offline use
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Offline fallback for navigation
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});
