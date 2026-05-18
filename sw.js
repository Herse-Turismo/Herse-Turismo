const CACHE = 'herse-v26';
const PRECACHE = [
    '/', '/login/', '/mi-viaje/', '/404.html', '/offline.html',
    '/assets/logo-web.png',
    '/manifest.json'
];
// URLs que nunca se cachean (API calls)
const SKIP_CACHE = ['supabase.co', 'sentry-cdn.com', 'open-meteo.com'];
// CDN assets (cache first strategy)
const CDN_CACHE = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'images.unsplash.com'];

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
    const url = e.request.url;
    // No cachear llamadas a APIs externas
    if (SKIP_CACHE.some(s => url.includes(s))) return;

    // CDN assets: cache first
    if (CDN_CACHE.some(s => url.includes(s))) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request).then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE).then(c => c.put(e.request, clone));
                    }
                    return res;
                }).catch(() => cached);
            })
        );
        return;
    }

    // Same origin: network first, fallback a cache then offline page
    if (!url.startsWith(self.location.origin)) return;
    e.respondWith(
        fetch(e.request).then(res => {
            if (res && res.status === 200) {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return res;
        }).catch(() =>
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                if (e.request.destination === 'document') return caches.match('/offline.html');
                return new Response('', { status: 503, statusText: 'Offline' });
            })
        )
    );
});
