const CACHE = 'app-auto';

self.addEventListener('install', (e) => {
 self.skipWaiting();
});

self.addEventListener('activate', (e) => {
 e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
 const req = e.request;

 // пропускаем не-GET и сторонние домены if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

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