/* Path2Safe Reunite: app UI, GPS, family sync, hazard download, route planning. */
{
const E = window.P2S_ENGINE, DATA = window.P2S_DATA;
const CFG = {
  liqUrl: 'https://www3.multco.us/gisagspublic/rest/services/EmergencyManagement/NHMP_HazardsData/MapServer/3/query',
  hzBounds: '-122.95,45.38,-122.35,45.68',         // Portland metro download extent (w,s,e,n)
  osrm: { foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/', bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/', car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' },
  speed: { foot: 4.5, bike: 14, car: 30 },          // km/h fallback when no street route
  pushEveryMs: 20000, pullEveryMs: 15000, staleMin: 30
};
const COLORS = ['#2F6FB0', '#8A4FB5', '#C2671B', '#0F8B8D', '#B5337A', '#5A7D1E'];
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtKm = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
const fmtMin = s => { const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
const ago = ts => { if (!ts) return 'never'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const STATUS = { ok: "OK", help: 'NEED HELP', injured: 'INJURED' };

/* ---------- state ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('p2s.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('p2s.' + k, JSON.stringify(v)); } catch (e) { } }
};
const S = store.get('state', null) || { me: { id: uid(), name: '', status: 'ok' }, members: {}, places: [], meet: null, mode: 'foot', overrides: {}, fb: { url: '', code: '' } };
const save = () => store.set('state', S);
let H = null, hzMeta = null; // hazard index

/* ---------- toast ---------- */
let tt; function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(tt); tt = setTimeout(() => t.style.display = 'none', ms || 3200); }

/* ---------- IndexedDB for big hazard data ---------- */
const idb = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('p2s', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
};

/* ---------- map ---------- */
const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([45.515, -122.66], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
const lyHz = L.layerGroup().addTo(map), lyBr = L.layerGroup().addTo(map), lyBe = L.layerGroup().addTo(map), lyPeople = L.layerGroup().addTo(map), lyRoutes = L.layerGroup().addTo(map);
const hzRenderer = L.canvas({ padding: 0.3 });

function drawHazards() {
  lyHz.clearLayers(); if (!H) return;
  for (const p of H.polys) {
    const ll = p.rings.map(r => r.map(([x, y]) => [y, x]));
    L.polygon(ll, { renderer: hzRenderer, stroke: false, fillColor: p.cls >= 5 ? '#B43D1A' : '#E4572E', fillOpacity: p.cls >= 5 ? 0.42 : 0.28, interactive: false }).addTo(lyHz);
  }
}
function env() { return { H, rivers: DATA.rivers, bridges: DATA.bridges, overrides: S.overrides, mode: S.mode }; }

function drawBridges() {
  lyBr.clearLayers();
  for (const b of DATA.bridges) {
    const open = E.bridgeOpen(b, S.mode, S.overrides), carNo = !b.modes[S.mode];
    const col = open ? '#1E6B45' : '#B43D1A';
    const icon = L.divIcon({ className: '', html: `<div class="brg" style="background:${col}"></div>`, iconSize: [16, 16] });
    L.marker([b.lat, b.lng], { icon, title: b.name }).bindPopup(`<b>${esc(b.name)}</b><br>${open ? 'Usable for this travel mode' : carNo ? 'Not open to this travel mode' : 'Assume closed after a major quake'}${b.note ? '<br><small>' + esc(b.note) + '</small>' : ''}${S.overrides[b.id] ? '<br><small>Field report: marked ' + S.overrides[b.id] + '</small>' : ''}`).addTo(lyBr);
  }
  $('#bridgeList').innerHTML = DATA.bridges.map(b => {
    const o = S.overrides[b.id] || '';
    return `<div class="member" style="grid-template-columns:1fr auto"><div><b>${esc(b.name)}</b><div class="meta">Default: ${b.quake === 'resilient' ? 'expected usable' : 'assume closed'}${b.id === 'tilikum' ? ' · no cars' : ''}${!b.modes.foot ? ' · freeway, no walking' : ''}</div></div>
    <select data-br="${b.id}" style="width:auto;min-height:36px"><option value="">Default</option><option value="open"${o === 'open' ? ' selected' : ''}>Open</option><option value="closed"${o === 'closed' ? ' selected' : ''}>Closed</option></select></div>`;
  }).join('');
}
function drawBeecn() {
  lyBe.clearLayers();
  const icon = L.divIcon({ className: '', html: '<div class="beecn"></div>', iconSize: [14, 14] });
  for (const [n, la, ln] of DATA.beecn) L.marker([la, ln], { icon, title: n }).bindPopup(`<b>${esc(n)}</b><br>BEECN help point<br><button class="btn sm" data-meet-beecn="${esc(n)}">Meet here</button>`).addTo(lyBe);
}

const pmarkers = {};
function colorOf(id) { const ids = Object.keys(S.members).sort(); const i = ids.indexOf(id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }
function personIcon(p, me) {
  const ini = esc((p.name || '?').trim().slice(0, 2).toUpperCase() || '?');
  const bg = me ? '#1E6B45' : colorOf(p.id);
  const ring = p.status === 'injured' ? '#B43D1A' : p.status === 'help' ? '#F2B705' : '#fff';
  return L.divIcon({ className: '', html: `<div class="mk ${me ? 'me' : ''} ${p.status === 'help' || p.status === 'injured' ? 'help' : ''}" style="background:${bg};border-color:${ring}">${ini}</div>`, iconSize: [30, 30] });
}
function drawPeople() {
  lyPeople.clearLayers();
  const all = [[S.me, true], ...Object.values(S.members).map(m => [m, false])];
  for (const [p, me] of all) if (p.lat != null) {
    L.marker([p.lat, p.lng], { icon: personIcon(p, me), zIndexOffset: 1000 }).bindPopup(`<b>${esc(p.name || (me ? 'You' : '?'))}</b> · ${STATUS[p.status] || 'OK'}<br><small>${esc(p.note || '')} ${p.src ? '(' + esc(p.src) + ')' : ''} · ${ago(p.ts)}</small>`).addTo(lyPeople);
  }
  for (const pl of S.places) L.marker([pl.lat, pl.lng], { icon: L.divIcon({ className: '', html: `<div class="flag" style="background:#3A4450">${esc(pl.name)}</div>`, iconSize: null, iconAnchor: [0, 12] }) }).addTo(lyPeople);
  if (S.meet) L.marker([S.meet.lat, S.meet.lng], { icon: L.divIcon({ className: '', html: `<div class="flag">Meet: ${esc(S.meet.name)}</div>`, iconSize: null, iconAnchor: [0, 12] }), zIndexOffset: 2000 }).addTo(lyPeople);
}

/* ---------- family list ---------- */
function renderMembers() {
  $('#myName').value = S.me.name || '';
  $$('#mySt button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === S.me.status));
  $('#myLoc').textContent = S.me.lat != null ? `Your spot: ${S.me.lat.toFixed(5)}, ${S.me.lng.toFixed(5)} · ${S.me.src || ''} · ${ago(S.me.ts)}${hzWarn(S.me)}` : 'No location yet.';
  const ms = Object.values(S.members);
  $('#members').innerHTML = ms.length ? ms.map(m => {
    const stale = m.ts && Date.now() - m.ts > CFG.staleMin * 60000;
    return `<div class="member"><div class="dot" style="background:${colorOf(m.id)}">${esc((m.name || '?').slice(0, 2).toUpperCase())}</div>
      <div><b>${esc(m.name)}</b> <span class="tag ${m.status}">${STATUS[m.status] || 'OK'}</span>${stale ? ' <span class="tag stale">last seen ' + ago(m.ts) + '</span>' : ''}
      <div class="meta">${esc(m.note || '')} ${m.src ? '· ' + esc(m.src) : ''} · ${ago(m.ts)}${hzWarn(m)}</div></div>
      <div class="row"><button class="btn ghost sm" data-zoom="${m.id}" aria-label="Show ${esc(m.name)}">Show</button><button class="btn ghost sm" data-del="${m.id}" aria-label="Remove ${esc(m.name)}">✕</button></div></div>`;
  }).join('') : '<p class="hint">No one else yet. Join a family in Setup, paste a text check-in, or load the demo family.</p>';
  renderCheckin(); renderMeetSel(); drawPeople();
}
function hzWarn(p) { if (!H || p.lat == null) return ''; const h = E.hazardAt(H, p.lat, p.lng); return h >= 5 ? ' · in a very high liquefaction zone' : h === 4 ? ' · in a high liquefaction zone' : ''; }

/* ---------- GPS ---------- */
let watchId = null;
function startGps() {
  if (!navigator.geolocation) return toast('This browser has no GPS access.');
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; setGpsPill(); $('#gpsBtn').textContent = 'Share my GPS'; return; }
  $('#gpsBtn').textContent = 'Stop GPS';
  watchId = navigator.geolocation.watchPosition(pos => {
    Object.assign(S.me, { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy), ts: Date.now(), src: 'GPS ±' + Math.round(pos.coords.accuracy) + ' m' });
    if (!S.me._centered) { map.setView([S.me.lat, S.me.lng], 14); S.me._centered = true; }
    save(); renderMembers(); setGpsPill(true); syncPush();
  }, err => { toast('GPS: ' + err.message); setGpsPill(false, true); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}
function setGpsPill(on, bad) { const p = $('#pGps'); p.className = 'pill ' + (on ? 'ok' : bad ? 'bad' : ''); p.textContent = on ? 'GPS on' : bad ? 'GPS blocked' : 'GPS off'; }

/* ---------- map picking ---------- */
let pickCb = null;
function pick(text, cb) { pickCb = cb; $('#pickTxt').textContent = text; document.body.classList.add('picking'); if (innerWidth <= 760) $('#sheet').classList.add('min'); }
function endPick() { pickCb = null; document.body.classList.remove('picking'); }
map.on('click', e => { if (!pickCb) return; const cb = pickCb; endPick(); cb(e.latlng.lat, e.latlng.lng); });
$('#pickCancel').onclick = endPick;

/* ---------- family sync (Firebase Realtime Database REST) ---------- */
let lastPush = 0, pullTimer = null;
const fbBase = () => S.fb.url && S.fb.code ? S.fb.url.replace(/\/+$/, '') + '/families/' + encodeURIComponent(S.fb.code) : null;
async function syncPush(force) {
  const base = fbBase(); if (!base || S.me.lat == null) return;
  if (!force && Date.now() - lastPush < CFG.pushEveryMs) return; lastPush = Date.now();
  const { id, name, status, lat, lng, ts, acc } = S.me;
  try { await fetch(`${base}/members/${id}.json`, { method: 'PUT', body: JSON.stringify({ id, name, status, lat, lng, ts, acc: acc || null }) }); setSync('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })); }
  catch (e) { setSync('Offline: will retry. Use a text check-in meanwhile.'); }
}
async function syncPull() {
  const base = fbBase(); if (!base) return;
  try {
    const j = await (await fetch(base + '.json')).json(); if (!j) return;
    for (const [id, m] of Object.entries(j.members || {})) if (id !== S.me.id && m && typeof m.lat === 'number') {
      const cur = S.members[id]; if (!cur || (m.ts || 0) >= (cur.ts || 0)) S.members[id] = { ...cur, ...m, id, src: 'live' };
    }
    if (j.meet && j.meet.ts > (S.meet?.ts || 0)) S.meet = j.meet;
    save(); renderMembers(); setSync('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  } catch (e) { setSync('Offline: showing last known locations.'); }
}
function setSync(t) { $('#syncMsg').textContent = t; }
function startSync() { clearInterval(pullTimer); if (!fbBase()) return; syncPull(); syncPush(true); pullTimer = setInterval(syncPull, CFG.pullEveryMs); }
async function shareMeet() { const base = fbBase(); if (base && S.meet) try { await fetch(base + '/meet.json', { method: 'PUT', body: JSON.stringify(S.meet) }); } catch (e) { } }

/* ---------- text check-in ---------- */
function checkinText() {
  if (S.me.lat == null) return null;
  const t = new Date(S.me.ts || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Path2Safe check-in - ${S.me.name || 'Me'}: ${STATUS[S.me.status]} at ${S.me.lat.toFixed(5)},${S.me.lng.toFixed(5)} (${t}).${S.meet ? ' Meet at ' + S.meet.name + ' ' + S.meet.lat.toFixed(5) + ',' + S.meet.lng.toFixed(5) + '.' : ''}`;
}
function renderCheckin() {
  const t = checkinText(); $('#ciText').textContent = t || 'Set your location first (Family tab).';
  $('#ciSms').href = t ? 'sms:?&body=' + encodeURIComponent(t) : '#';
}
function parseCheckins(txt) {
  const re = /Path2Safe check-in\s*[-–—]\s*(.+?):\s*(OK|NEED HELP|INJURED)\s+at\s+(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/gi, out = [];
  let m; while ((m = re.exec(txt))) out.push({ name: m[1].trim().slice(0, 40), status: { 'OK': 'ok', 'NEED HELP': 'help', 'INJURED': 'injured' }[m[2].toUpperCase()], lat: +m[3], lng: +m[4] });
  const mm = /Meet at (.+?) (-?\d+\.\d+),(-?\d+\.\d+)/i.exec(txt);
  return { people: out, meet: mm ? { name: mm[1].slice(0, 60), lat: +mm[2], lng: +mm[3], ts: Date.now() } : null };
}

/* ---------- meeting point ---------- */
function meetOptions() {
  const o = [];
  S.places.forEach(p => o.push({ k: 'pl:' + p.id, name: p.name, lat: p.lat, lng: p.lng, g: 'Saved places' }));
  const ref = S.me.lat != null ? [S.me.lat, S.me.lng] : [map.getCenter().lat, map.getCenter().lng];
  DATA.beecn.map(([n, la, ln]) => ({ k: 'be:' + n, name: n, lat: la, lng: ln, g: 'BEECN help points (nearest)', d: E.hav(ref, [la, ln]) })).sort((a, b) => a.d - b.d).slice(0, 8).forEach(x => o.push(x));
  return o;
}
function renderMeetSel() {
  const opts = meetOptions(), sel = $('#meetSel');
  let html = '<option value="">Choose a meeting point</option>', g = '';
  if (S.meet && !opts.some(x => x.name === S.meet.name)) html += `<option value="cur" selected>${esc(S.meet.name)}</option>`;
  for (const x of opts) { if (x.g !== g) { if (g) html += '</optgroup>'; html += `<optgroup label="${esc(x.g)}">`; g = x.g; } html += `<option value="${esc(x.k)}"${S.meet && S.meet.name === x.name ? ' selected' : ''}>${esc(x.name)}${x.d ? ' · ' + fmtKm(x.d) : ''}</option>`; }
  sel.innerHTML = html + (g ? '</optgroup>' : '');
}
function setMeet(m) { S.meet = { name: m.name, lat: m.lat, lng: m.lng, ts: Date.now() }; save(); renderMembers(); shareMeet(); }

/* ---------- hazard download ---------- */
async function loadHazards(force) {
  const pill = $('#pHz');
  if (!force) {
    try { const c = await idb.get('liq'); if (c) { useHazards(c.fc, c.meta); return; } } catch (e) { }
  }
  if (!navigator.onLine) { pill.className = 'pill bad'; pill.textContent = 'No hazard data'; $('#hzInfo').textContent = 'No saved hazard data and no connection. Routes will avoid only rivers and closed bridges.'; return; }
  pill.className = 'pill warn'; pill.textContent = 'Downloading…';
  try {
    let feats = [], off = 0, more = true;
    while (more && off < 20000) {
      const u = CFG.liqUrl + '?' + new URLSearchParams({ where: 'Class>=4', geometry: CFG.hzBounds, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'Class', outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5, resultOffset: off, resultRecordCount: 1000, f: 'geojson' });
      const j = await (await fetch(u)).json(); if (j.error) throw new Error(j.error.message);
      feats = feats.concat(j.features || []); more = !!(j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit)); off += 1000;
      pill.textContent = 'Downloading… ' + feats.length;
    }
    const fc = { type: 'FeatureCollection', features: feats }, meta = { when: Date.now(), n: feats.length, src: 'DOGAMI O-19-09 liquefaction susceptibility (Multnomah County NHMP service)' };
    try { await idb.set('liq', { fc, meta }); } catch (e) { }
    useHazards(fc, meta); toast('Hazard data saved for offline use.');
  } catch (e) {
    pill.className = 'pill bad'; pill.textContent = 'Hazards failed'; $('#hzInfo').textContent = 'Download failed (' + e.message + '). Try again when online.';
  }
}
function useHazards(fc, meta) {
  H = E.buildIndex(E.fromGeoJSON(fc, 'Class')); hzMeta = meta;
  $('#pHz').className = 'pill ok'; $('#pHz').textContent = 'Hazards saved';
  $('#hzInfo').innerHTML = `${meta.n.toLocaleString()} high / very high liquefaction areas, saved ${new Date(meta.when).toLocaleDateString()}.<br>${esc(meta.src)}.`;
  drawHazards(); renderMembers();
}

/* ---------- routing ---------- */
async function streetRoute(pts, mode) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try {
    const u = CFG.osrm[mode] + pts.map(p => p[1].toFixed(5) + ',' + p[0].toFixed(5)).join(';') + '?overview=full&geometries=geojson&continue_straight=false';
    const j = await (await fetch(u, { signal: ctl.signal })).json();
    if (j.code !== 'Ok' || !j.routes.length) return null;
    const r = j.routes[0]; return { line: r.geometry.coordinates.map(([x, y]) => [y, x]), dur: r.duration, dist: r.distance };
  } catch (e) { return null; } finally { clearTimeout(to); }
}
function evaluate(line, en) {
  const ex = E.exposure(H, line), cx = E.crossings(line, en);
  const bad = cx.filter(c => c.bridge && !c.open), used = cx.filter(c => c.bridge && c.open).map(c => c.bridge.name);
  return { ex, bad, used: [...new Set(used)], score: E.score(ex) + (bad.length ? 1e7 : 0) };
}

async function planRoutes() {
  if (!S.meet) return toast('Choose a meeting point first.');
  const people = [S.me, ...Object.values(S.members)].filter(p => p.lat != null);
  if (!people.length) return toast('No one has a location yet.');
  $('#routes').innerHTML = '<p class="hint">Planning…</p>'; lyRoutes.clearLayers();
  await new Promise(r => setTimeout(r, 30));
  const en = env(), target = [S.meet.lat, S.meet.lng];
  const bounds = E.padBounds([target, ...people.map(p => [p.lat, p.lng])], 2500);
  const G = E.buildGrid(bounds, en, 320), D = E.dijkstra(G, E.nearestDry(G, target[0], target[1]));
  const online = navigator.onLine, results = [];
  for (const p of people) {
    const isMe = p === S.me, col = isMe ? '#1E6B45' : colorOf(p.id);
    const path = E.trace(G, D, E.nearestDry(G, p.lat, p.lng));
    if (!path) { results.push({ p, col, fail: true }); continue; }
    const corridor = [[p.lat, p.lng], ...E.toLatLngs(G, E.smooth(G, path)).slice(1, -1), target];
    let best = { kind: 'corridor', line: corridor, ...evaluate(corridor, en) };
    best.dist = best.ex.len; best.dur = best.dist / (CFG.speed[S.mode] / 3.6);
    if (online) {
      const cands = await Promise.all([streetRoute([[p.lat, p.lng], target], S.mode), streetRoute(E.viaPoints(corridor, en), S.mode)]);
      for (const [i, c] of cands.entries()) if (c) {
        const ev = { kind: i ? 'street-safe' : 'street-direct', line: c.line, dist: c.dist, dur: c.dur, ...evaluate(c.line, en) };
        if (!ev.bad.length && (best.kind === 'corridor' || ev.score < best.score)) best = ev;
      }
    }
    const cEx = E.exposure(H, corridor), extra = (best.ex.m5 + best.ex.m4) - (cEx.m5 + cEx.m4);
    results.push({ p, col, best, corridor, extra: best.kind !== 'corridor' && extra > 300 ? extra : 0 });
    if (best.kind !== 'corridor') L.polyline(corridor, { color: col, weight: 3, opacity: .45, dashArray: '4 8' }).bindTooltip('Safe corridor').addTo(lyRoutes);
    L.polyline(best.line, { color: '#fff', weight: 8, opacity: .9 }).addTo(lyRoutes);
    L.polyline(best.line, { color: col, weight: 5, opacity: .95, dashArray: best.kind === 'corridor' ? '8 8' : null }).bindTooltip(p.name || 'You').addTo(lyRoutes);
  }
  const all = results.filter(r => r.best).flatMap(r => r.best.line); if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [30, 30] });
  $('#routes').innerHTML = results.map(r => {
    if (r.fail) return `<div class="route" style="border-color:${r.col}"><b>${esc(r.p.name || 'You')}</b><div class="warn">No safe path found. Every crossing is closed or blocked. Stay put, shelter safely, and send a text check-in.</div></div>`;
    const b = r.best, hzM = b.ex.m5 + b.ex.m4, pct = b.ex.len ? Math.round(100 * hzM / b.ex.len) : 0;
    const kind = b.kind === 'corridor' ? 'Offline safe-corridor line (follow streets that stay close to it)' : b.kind === 'street-safe' ? 'Street route steered around hazards' : 'Most direct street route (already the safest)';
    return `<div class="route" style="border-color:${r.col}"><b>${esc(r.p.name || 'You')}</b> · ${STATUS[r.p.status] || 'OK'}
      <div class="row" style="gap:14px"><span><b>${fmtKm(b.dist)}</b></span><span>about <b>${fmtMin(b.dur)}</b> in normal conditions</span></div>
      <div class="meta">${kind}${b.used.length ? ' · crosses ' + esc(b.used.join(', ')) : ''}</div>
      <div class="meta">Through liquefaction zones: ${fmtKm(hzM)} (${pct}%)${b.ex.m5 ? ', of which very high ' + fmtKm(b.ex.m5) : ''}</div><div class="bar"><i style="width:${pct}%"></i></div>
      ${r.extra ? '<div class="warn">The street route runs through ' + fmtKm(r.extra) + ' more hazard zone than the safe corridor (thin dashed line). Where you can, use streets closer to the corridor.</div>' : ''}
      ${r.p.status !== 'ok' ? '<div class="warn">Marked ' + STATUS[r.p.status] + ': others should go to them or send help if it is safe.</div>' : ''}</div>`;
  }).join('') + `<p class="src">Expect debris, downed lines and closures the data can't show. Walking is usually the most reliable way to move after a big quake.${online ? '' : ' Offline: showing corridor lines only.'}</p>`;
}

async function fairestPoint() {
  const people = [S.me, ...Object.values(S.members)].filter(p => p.lat != null);
  if (people.length < 2) return toast('Need at least two people with locations.');
  const pts = people.map(p => [p.lat, p.lng]);
  const bounds = E.padBounds(pts, 3000), en = env(), G = E.buildGrid(bounds, en, 260);
  const cands = [...S.places.map(p => ({ name: p.name, lat: p.lat, lng: p.lng })), ...DATA.beecn.map(([n, la, ln]) => ({ name: n, lat: la, lng: ln }))]
    .filter(c => c.lat > bounds.s && c.lat < bounds.n && c.lng > bounds.w && c.lng < bounds.e && E.hazardAt(H, c.lat, c.lng) < 4);
  if (!cands.length) return toast('No saved place or BEECN site in range. Pick one on the map.');
  const Ds = people.map(p => E.dijkstra(G, E.nearestDry(G, p.lat, p.lng)));
  let best = null;
  for (const c of cands) { const i = E.nearestDry(G, c.lat, c.lng); const worst = Math.max(...Ds.map(D => D.dist[i])); if (worst < Infinity && (!best || worst < best.w)) best = { ...c, w: worst }; }
  if (!best) return toast('No reachable meeting point. Bridges between you may all be closed.');
  setMeet(best); toast(`Fairest point: ${best.name} (longest trip about ${fmtKm(best.w * G.cell)} safe-path equivalent).`, 5000);
  map.setView([best.lat, best.lng], 13);
}

/* ---------- demo ---------- */
function loadDemo() {
  const d = DATA.demo;
  if (!S.places.some(p => p.name === d.home.name)) S.places.push({ id: uid(), ...d.home });
  d.members.forEach(m => { const id = 'demo-' + m.name.toLowerCase(); S.members[id] = { id, ...m, ts: Date.now() - Math.random() * 6e5, src: 'demo' }; });
  if (S.me.lat == null) Object.assign(S.me, { name: S.me.name || 'You', lat: 45.5005, lng: -122.6410, ts: Date.now(), src: 'demo spot' });
  setMeet({ name: d.home.name, lat: d.home.lat, lng: d.home.lng });
  map.fitBounds(L.latLngBounds([[S.me.lat, S.me.lng], ...d.members.map(m => [m.lat, m.lng]), [d.home.lat, d.home.lng]]), { padding: [40, 40] });
  toast('Demo family loaded. Open Reunite and plan routes.');
}

/* ---------- places ---------- */
function renderPlaces() {
  $('#places').innerHTML = S.places.length ? S.places.map(p => `<div class="member" style="grid-template-columns:1fr auto"><div><b>${esc(p.name)}</b><div class="meta">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${hzWarn(p)}</div></div><button class="btn ghost sm" data-delpl="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button></div>`).join('') : '<p class="hint">Save home, school, work and your family meeting spots.</p>';
}

/* ---------- name prompt (in-page, no browser dialogs) ---------- */
function askName(label, cb) {
  const box = document.createElement('div'); box.className = 'card'; box.innerHTML = `<label class="f">${esc(label)}</label><div class="row"><input type="text" class="grow"><button class="btn sm">Save</button></div>`;
  const pane = $('.pane.on'); pane.prepend(box); const inp = box.querySelector('input'); inp.focus(); $('#sheet').classList.remove('min');
  const done = () => { const v = inp.value.trim(); box.remove(); if (v) cb(v.slice(0, 40)); };
  box.querySelector('button').onclick = done; inp.onkeydown = e => { if (e.key === 'Enter') done(); };
}

/* ---------- events ---------- */
$$('nav.tabs button').forEach(b => b.onclick = () => {
  $$('nav.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
  $$('.pane').forEach(p => p.classList.toggle('on', p.id === 't-' + b.dataset.t));
  $('#sheet').classList.remove('min'); if (b.dataset.t === 'setup') renderPlaces(); if (b.dataset.t === 'reunite') renderMeetSel();
});
$('#grab').onclick = () => $('#sheet').classList.toggle('min');
$('#myName').oninput = e => { S.me.name = e.target.value.slice(0, 40); save(); renderCheckin(); drawPeople(); };
$$('#mySt button').forEach(b => b.onclick = () => { S.me.status = b.dataset.s; S.me.ts = S.me.ts || Date.now(); save(); renderMembers(); syncPush(true); });
$('#gpsBtn').onclick = startGps;
$('#pickMe').onclick = () => pick('Tap where you are', (la, ln) => { Object.assign(S.me, { lat: la, lng: ln, ts: Date.now(), src: 'set on map' }); save(); renderMembers(); syncPush(true); });
$('#addMember').onclick = () => pick('Tap where they are', (la, ln) => askName('Their name', n => { const id = uid(); S.members[id] = { id, name: n, status: 'ok', lat: la, lng: ln, ts: Date.now(), src: 'added by hand' }; save(); renderMembers(); }));
$('#demoBtn').onclick = loadDemo;
$('#members').onclick = e => {
  const z = e.target.closest('[data-zoom]'), d = e.target.closest('[data-del]');
  if (z) { const m = S.members[z.dataset.zoom]; map.setView([m.lat, m.lng], 15); if (innerWidth <= 760) $('#sheet').classList.add('min'); }
  if (d) { delete S.members[d.dataset.del]; save(); renderMembers(); }
};
$('#meetSel').onchange = e => { const v = e.target.value; if (!v || v === 'cur') return; const o = meetOptions().find(x => x.k === v); if (o) setMeet(o); };
$('#pickMeet').onclick = () => pick('Tap the meeting point', (la, ln) => askName('Name this meeting point', n => setMeet({ name: n, lat: la, lng: ln })));
$('#fairBtn').onclick = fairestPoint;
$$('#modeSeg button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.m === S.mode); b.onclick = () => { S.mode = b.dataset.m; save(); $$('#modeSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawBridges(); }; });
$('#planBtn').onclick = planRoutes;
$('#ciCopy').onclick = async () => { const t = checkinText(); if (!t) return toast('Set your location first.'); try { await navigator.clipboard.writeText(t); toast('Copied. Paste it into a text message.'); } catch (e) { toast('Copy blocked: press and hold the message to copy.'); } };
$('#ciAdd').onclick = () => {
  const r = parseCheckins($('#ciPaste').value);
  if (!r.people.length) { $('#ciMsg').textContent = 'No Path2Safe check-in found in that text.'; return; }
  r.people = r.people.filter(p => !(S.me.lat != null && E.hav([p.lat, p.lng], [S.me.lat, S.me.lng]) < 5 && p.name === (S.me.name || 'Me')));
  if (!r.people.length) { $('#ciMsg').textContent = 'That check-in is your own.'; return; }
  r.people.forEach(p => { const id = 'sms-' + p.name.toLowerCase().replace(/\W+/g, '-'); S.members[id] = { id, ...p, ts: Date.now(), src: 'text check-in' }; });
  if (r.meet && !S.meet) S.meet = r.meet;
  save(); renderMembers(); $('#ciPaste').value = ''; $('#ciMsg').textContent = 'Added ' + r.people.map(p => p.name).join(', ') + '.';
};
$('#hzLoad').onclick = () => loadHazards(true);
$('#lyHz').onchange = e => e.target.checked ? map.addLayer(lyHz) : map.removeLayer(lyHz);
$('#lyBr').onchange = e => e.target.checked ? map.addLayer(lyBr) : map.removeLayer(lyBr);
$('#lyBe').onchange = e => e.target.checked ? map.addLayer(lyBe) : map.removeLayer(lyBe);
$('#bridgeList').onchange = e => { const s = e.target.closest('[data-br]'); if (!s) return; if (s.value) S.overrides[s.dataset.br] = s.value; else delete S.overrides[s.dataset.br]; save(); drawBridges(); };
$('#addPlace').onclick = () => pick('Tap the place', (la, ln) => askName('Name (Home, School, Work…)', n => { S.places.push({ id: uid(), name: n, lat: la, lng: ln }); save(); renderPlaces(); renderMembers(); }));
$('#places').onclick = e => { const d = e.target.closest('[data-delpl]'); if (d) { S.places = S.places.filter(p => p.id !== d.dataset.delpl); save(); renderPlaces(); renderMembers(); } };
$('#fbUrl').value = S.fb.url; $('#famCode').value = S.fb.code;
$('#newCode').onclick = () => { const a = new Uint32Array(3); crypto.getRandomValues(a); $('#famCode').value = [...a].map(x => x.toString(36)).join('-'); };
$('#joinBtn').onclick = () => {
  const url = $('#fbUrl').value.trim(), code = $('#famCode').value.trim();
  if (url && !/^https:\/\/[\w.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(url)) { setSync('That does not look like a Firebase Realtime Database URL.'); return; }
  if (code && code.length < 12) { setSync('Use a family code of at least 12 characters so others cannot guess it.'); return; }
  S.fb = { url, code }; save(); setSync(url && code ? 'Joining…' : 'Live sharing off.'); startSync();
};
$('#resetBtn').onclick = () => { S.members = {}; S.places = []; S.meet = null; save(); lyRoutes.clearLayers(); $('#routes').innerHTML = ''; renderMembers(); renderPlaces(); toast('Cleared.'); };
document.addEventListener('click', e => { const b = e.target.closest('[data-meet-beecn]'); if (!b) return; const s = DATA.beecn.find(x => x[0] === b.dataset.meetBeecn); if (s) { setMeet({ name: s[0], lat: s[1], lng: s[2] }); map.closePopup(); toast('Meeting point set: ' + s[0]); } });
const netPill = () => { const p = $('#pNet'); p.className = 'pill ' + (navigator.onLine ? 'ok' : 'bad'); p.textContent = navigator.onLine ? 'Online' : 'Offline'; };
addEventListener('online', () => { netPill(); syncPull(); syncPush(true); }); addEventListener('offline', netPill);

/* ---------- boot ---------- */
netPill(); setGpsPill(); drawBridges(); drawBeecn(); renderMembers(); renderPlaces(); loadHazards(false); startSync();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
window.P2S_APP = { S, planRoutes, fairestPoint, loadDemo, parseCheckins, useHazards }; // for testing
}
