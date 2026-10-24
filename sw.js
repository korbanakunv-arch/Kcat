/* KCAT service worker v27
   - Cache app shell agar KCAT bisa dibuka walau offline
   - HTML: network-first (selalu ambil versi terbaru, fallback ke cache)
   - SDK Firebase (URL berversi): cache-first
   - Lalu lintas Firestore/Auth TIDAK dicegat (biar SDK mengurus koneksinya sendiri)
   - Push notification (FCM) + klik notifikasi */
const VER = 'kcat-v27';
const SHELL = 'shell-' + VER;
const LIBS = 'libs-' + VER;
const PRECACHE = [
  './', 'index.html', 'offline.html', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // satu file gagal tidak boleh membatalkan instalasi
    await Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, LIBS]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (_) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

const isLib = u =>
  (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) ||
  (u.hostname.endsWith('jsdelivr.net') && u.pathname.includes('/firebase@')) ||
  (u.hostname === 'esm.sh' && u.pathname.includes('/firebase@'));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);

  // pustaka Firebase: cache-first
  if (isLib(u)) {
    e.respondWith((async () => {
      const c = await caches.open(LIBS);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  if (u.origin !== self.location.origin) return; // API Firebase & lainnya: biarkan lewat

  // halaman: network-first (timeout 6 dtk) -> cache -> offline.html
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        const pre = await e.preloadResponse;
        const res = pre || await Promise.race([
          fetch(req),
          new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 6000))
        ]);
        if (res && res.ok) {
          const key = new Request(u.origin + u.pathname.replace(/[^/]*$/, '') + 'index.html');
          c.put(key, res.clone()).catch(() => {});
          return res;
        }
        throw new Error('bad');
      } catch (_) {
        return (await c.match(req, { ignoreSearch: true })) ||
               (await c.match('index.html', { ignoreSearch: true })) ||
               (await c.match('./', { ignoreSearch: true })) ||
               (await c.match('offline.html')) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // aset lokal (ikon, manifest): stale-while-revalidate
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});

/* ------------------------------ PUSH ------------------------------ */
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { try { p = { notification: { body: e.data.text() } }; } catch (__) {} }
  const n = p.notification || {}, d = p.data || {};
  const room = d.room || d.kcOpen || '';
  e.waitUntil((async () => {
    // kalau KCAT sedang terbuka & dilihat, tidak perlu notifikasi sistem
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.some(c => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(n.title || d.title || 'KCAT', {
      body: n.body || d.body || 'Pesan baru',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || room || 'kcat',
      renotify: true,
      data: { room, url: d.url || (room ? './?room=' + encodeURIComponent(room) : './') }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        if (d.room) c.postMessage({ kcOpen: d.room });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(d.url || './');
  })());
});
