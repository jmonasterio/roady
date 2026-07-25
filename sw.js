// Service Worker - Network-First Strategy
// Works great for both development and production!
// No manual version bumping needed - always fetches latest from network

const BUILD = '20260704u';
const CACHE_NAME = 'roady-v1';
// Version the runtime cache by build so stale ?v= assets and one-off
// /?invite_token=… navigations don't accumulate forever — the activate
// handler below deletes any cache whose name isn't in this set.
const RUNTIME_CACHE = `roady-runtime-${BUILD}`;

// CDN hosts we intentionally cache for offline boot. index.html loads these
// without crossorigin, so their responses come back opaque (type 'opaque',
// status 0); we cache them anyway, but ONLY for these explicit hosts.
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

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

  // Skip cross-origin requests except allowlisted CDNs (scripts, styles, fonts)
  if (url.origin !== self.location.origin && !CDN_HOSTS.includes(url.hostname)) {
    return;
  }

  event.respondWith(
    // Navigations must revalidate at origin — otherwise the browser HTTP
    // cache can hand the SW a stale index.html and the phone sits on an
    // old build until the cache expires.
    fetch(event.request, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined)
      .then(response => {
        // Cache same-origin 200s normally. The CDN scripts/styles/fonts are
        // loaded without crossorigin (see index.html), so their responses are
        // opaque (type 'opaque', status 0) and would never satisfy
        // status===200 — cache those too, but ONLY for allowlisted CDN hosts,
        // so an offline boot still has a live shell. Skip query-string
        // navigations (e.g. /?invite_token=…) so they don't pile up forever.
        const sameOrigin = url.origin === self.location.origin;
        const isCdn = CDN_HOSTS.includes(url.hostname);
        const skipQueryNav = req.mode === 'navigate' && url.search !== '';
        const cacheable = !skipQueryNav && response && (
          (sameOrigin && response.status === 200) ||
          (isCdn && (response.status === 200 || response.type === 'opaque'))
        );
        if (cacheable) {
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
            // Offline fallback for navigation. The shell is cached under '/',
            // not '/index.html'; ignoreSearch so /?invite_token=… resolves too.
            if (event.request.mode === 'navigate') {
              return caches.match('/', { ignoreSearch: true });
            }
          });
      })
  );
});
