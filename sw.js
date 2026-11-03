// Places Map offline cache. Version changes with every build, so updates arrive.
const V = 'pm-02e69a28ee';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('pm-') && k !== V && k !== 'pm-tiles').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Live data is never cached.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.startsWith('nominatim.')) return;

  // The app page: try the network first (gets updates), fall back to the saved copy offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put('./index.html', cp)); }
      return r;
    }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }

  // Map tiles: keep up to ~600 recently seen ones so places you've looked at still show offline.
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open('pm-tiles').then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((r) => {
        if (r.ok) { c.put(req, r.clone()); trim(c); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })));
    return;
  }

  // Everything else (map library, icons): saved copy first.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && (url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com')) {
      const cp = r.clone(); caches.open(V).then((c) => c.put(req, cp));
    }
    return r;
  })));
});

let trimming = false;
function trim(c) {
  if (trimming) return;
  trimming = true;
  c.keys().then((ks) => Promise.all(ks.slice(0, Math.max(0, ks.length - 600)).map((k) => c.delete(k))))
    .finally(() => { trimming = false; });
}
