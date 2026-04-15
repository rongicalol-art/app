const STATIC_CACHE = 'mandarin-flashcards-static-v20260416-clickfix';

const isCacheableAsset = request => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  return /\.(?:css|js|woff2?|png|jpg|jpeg|gif|svg|json)$/i.test(url.pathname);
};

const putIfOk = async (cache, request, response) => {
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
};

const handleNavigation = async request => {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await cache.put('index.html', response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return cache.match('index.html');
  }
};

const handleStaticAsset = async request => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(response => putIfOk(cache, request, response))
    .catch(() => cached);
  return cached || networkPromise;
};

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('mandarin-flashcards-static-') && key !== STATIC_CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!isCacheableAsset(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleStaticAsset(request));
});
