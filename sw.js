const CACHE = 'app-v5';

const FILES = [
 './',
 './index.html',
 './styles.css',
 './app.js',
 './chat.html',
 './chat.css',
 './chat.js',

 './manifest-pila.json',
 './manifest-pila-hdf.json',

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
 e.waitUntil(
 Promise.all([
 self.clients.claim(),
 caches.keys().then(keys =>
 Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
 )
 ])
 );
});

self.addEventListener('message', (e) => {
 if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
 const req = e.request;
 if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

 // HTML — network-first if (req.mode === 'navigate' || req.destination === 'document') {
 e.respondWith(
 fetch(req).catch(() => caches.match(req))
 );
 return;
 }

 // остальное — cache-first e.respondWith(
 caches.match(req).then(cached => {
 return cached || fetch(req).then(res => {
 const copy = res.clone();
 caches.open(CACHE).then(cache => cache.put(req, copy));
 return res;
 });
 })
 );
});
