
// === Версия кэша (обновляйте при каждом релизе) ===
const CACHE_NAME = 'service-pro-v59.5';

// === Предкэшируемые ресурсы ===
const URLS_TO_CACHE = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-1024.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'icon-maskable-1024.png',
  'screenshot-main.png'
];

const isNavigationRequest = (req) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

const isCacheableResponse = (res) =>
  res && res.status === 200 && (res.type === 'basic' || res.type === 'cors');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : Promise.resolve())));
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const networkResp = preload || await fetch(request);
        if (isCacheableResponse(networkResp)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('index.html', networkResp.clone());
        }
        return networkResp;
      } catch (e) {
        const cachedExact = await caches.match(request);
        if (cachedExact) return cachedExact;
        const cachedIndex = await caches.match('index.html');
        if (cachedIndex) return cachedIndex;
        return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 });
      }
    })());
    return;
  }

  const isStatic = /\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|json)$/i.test(url.pathname) || url.pathname.endsWith('manifest.json');

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((resp) => { if (isCacheableResponse(resp)) cache.put(request, resp.clone()); return resp; })
        .catch(() => null);
      return cached || (await fetchPromise) || new Response('', { status: 504 });
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (url.origin === self.location.origin) {
        const fallback = await caches.match('index.html');
        if (fallback) return fallback;
      }
      return new Response('', { status: 504 });
    }
  })());
});
