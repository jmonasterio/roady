// Roady Service Worker
const CACHE_NAME = 'roady-v1';
const RUNTIME_CACHE = 'roady-runtime';

// Files to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/db.js',
  '/manifest.json',
  // CDN resources
  'https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css',
  'https://cdn.jsdelivr.net/npm/pouchdb@8.0.1/dist/pouchdb.min.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js'
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) &&
      !event.request.url.includes('cdn.jsdelivr.net')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return caches.open(RUNTIME_CACHE)
          .then(cache => {
            return fetch(event.request)
              .then(response => {
                // Cache successful responses
                if (response && response.status === 200) {
                  cache.put(event.request, response.clone());
                }
                return response;
              });
          });
      })
      .catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});

// Background sync for future features
self.addEventListener('sync', event => {
  if (event.tag === 'sync-gigs') {
    event.waitUntil(syncGigs());
  }
});

async function syncGigs() {
  // Placeholder for future sync functionality
  console.log('Background sync triggered');
}

// Push notifications for future features
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Roady', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});
