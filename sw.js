const CACHE = 'herse-v7';
const PRECACHE = [
    '/', '/login/', '/mi-viaje/', '/404.html',
    '/assets/logo-web.png',
    '/manifest.json'
];
// URLs que nunca se cachean (API calls)
const SKIP_CACHE = ['supabase.co', 'sentry-cdn.com'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    // No cachear llamadas a APIs externas
    if (SKIP_CACHE.some(s => e.request.url.includes(s))) return;
    if (!e.request.url.startsWith(self.location.origin)) return;
    // Network first, fallback a cache
    e.respondWith(
        fetch(e.request).then(res => {
            if (res && res.status === 200) {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return res;
        }).catch(() =>
            caches.match(e.request).then(cached => cached || caches.match('/404.html'))
        )
    );
});
