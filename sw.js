const CACHE = 'app-auto';

self.addEventListener('install', () => {
 self.skipWaiting();
});

self.addEventListener('activate', (e) => {
 e.waitUntil(self.clients.claim());
});

self.addEventListener('message', (e) => {
 if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
 const req = e.request;
 if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

 e.respondWith(
 fetch(req)
 .then(res => {
 const copy = res.clone();
 caches.open(CACHE).then(cache => cache.put(req, copy));
 return res;
 })
 .catch(() => caches.match(req))
 );
});
