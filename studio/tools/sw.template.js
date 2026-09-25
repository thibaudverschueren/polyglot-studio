/* Polyglot Studio service worker — version __VERSION__
   index.html: network-first (daily content updates), cache fallback when offline.
   Static assets (fonts, audio, icons, compiler): cache-first. GitHub API: never cached. */
const VERSION = '__VERSION__';
const CORE = `polyglot-core-${VERSION}`;
const ASSETS = 'polyglot-assets-v1';
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/favicon.svg'].concat(__FONTS__);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('polyglot-core-') && k !== CORE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.github.com') return;
  const sameOrigin = url.origin === self.location.origin;
  const isPage = req.mode === 'navigate' || (sameOrigin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));
  if (isPage) {
    e.respondWith((async () => {
      const cache = await caches.open(CORE);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
        clearTimeout(timer);
        if (res.ok) cache.put('index.html', res.clone());
        return res;
      } catch (err) {
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }
  // worker + manifest can change between builds: serve the cached copy, refresh it in the background
  if (sameOrigin && /solc-worker\.js$|manifest\.webmanifest$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      const fresh = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
      if (hit) { e.waitUntil(fresh.then(() => {})); return hit; }
      return fresh;
    })());
    return;
  }
  const cacheable = sameOrigin && /\/(assets|audio|icons|pdfs)\//.test(url.pathname);
  const solc = /soljson/.test(url.pathname);
  if (cacheable || solc) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
  }
});
