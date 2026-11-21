/* Path2Safe Reunite service worker: keeps the app, map tiles you've viewed and hazard data usable offline. */
const V = 'p2s-v12';
const SHELL = ['./', 'index.html', 'app.js', 'engine.js', 'data.js', 'manifest.webmanifest', 'icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
const TILE_MAX = 2500;

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(V)).map(k => caches.delete(k)))).then(() => self.clients.claim())));

async function trimTiles(c) { const ks = await c.keys(); for (let i = 0; i < ks.length - TILE_MAX; i++) await c.delete(ks[i]); }

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('firebaseio.com') || u.hostname.endsWith('firebasedatabase.app') || u.hostname === 'routing.openstreetmap.de' || u.hostname === 'nominatim.openstreetmap.org' || u.hostname === 'photon.komoot.io') return; // live only
  if (u.hostname === 'tile.openstreetmap.org') {       // tiles: cache first, keep what you've looked at
    e.respondWith(caches.open(V + '-tiles').then(async c => {
      const hit = await c.match(e.request); if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok) { c.put(e.request, r.clone()); trimTiles(c); } return r; } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (u.pathname.includes('/rest/services/')) {          // GIS: network first, cached copy when offline
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V + '-gis').then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (u.origin === location.origin) {                    // app files: fresh when online, saved copy when offline
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));   // pinned libraries (Leaflet)
});
