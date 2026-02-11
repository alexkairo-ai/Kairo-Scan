const CACHE = 'app-auto';

const FILES = [
 './',
 './index.html',
 './styles.css',
 './app.js',
 './chat.html',
 './chat.css',
 './chat.js',
 './manifest.json',

 './upakovka.html',
 './kromka.html',
 './hdf.html',
 './pila.html',
 './prisadka.html',
 './pila-hdf.html'
];

self.addEventListener('install', (e) => {
 self.skipWaiting();
 e.waitUntil(
 caches.open(CACHE).then(cache => cache.addAll(FILES))
 );
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
