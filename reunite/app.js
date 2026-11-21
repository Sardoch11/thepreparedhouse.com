/* Path2Safe Reunite: app UI, GPS, family sync, hazard download, route planning. */
{
const E = window.P2S_ENGINE, DATA = window.P2S_DATA;
const CFG = {
  hzBounds: '-123.25,45.15,-122.10,45.80',         // Multnomah, Washington and Clackamas counties (urban areas) plus Vancouver (w,s,e,n)
  osrm: { foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/', bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/', car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' },
  speed: { foot: 4.5, bike: 14, car: 30 },          // km/h fallback when no street route
  pushEveryMs: 20000, pullEveryMs: 15000, staleMin: 30
};
/* Map layers. "avoid" = routes steer around them; "prefer" = routes favour them; "image" = shown only. */
const LAYERS = [
  { id: 'liq', type: 'avoid', name: 'Liquefaction, high and very high', src: 'DOGAMI O-19-09 via Multnomah County',
    url: 'https://www3.multco.us/gisagspublic/rest/services/EmergencyManagement/NHMP_HazardsData/MapServer/3', where: 'Class>=4', fields: 'Class', page: 1000,
    build: fc => E.fromGeoJSON(fc, 'Class'), swatch: ['#B43D1A', '#E4572E'],
    style: p => ({ fillColor: p.cls >= 5 ? '#B43D1A' : '#E4572E', fillOpacity: p.cls >= 5 ? 0.42 : 0.28 }) },
  { id: 'slide', type: 'avoid', name: 'Mapped landslides', src: 'DOGAMI SLIDO 4.5',
    url: 'https://services8.arcgis.com/8PAo5HGmvRMlF2eU/arcgis/rest/services/SLIDO_Release_4p5_wMetadata_gdb/FeatureServer/4', where: '1=1', fields: 'TYPE_MOVE', page: 2000,
    build: fc => E.fromGeoJSON(fc, null, { kind: 'slide', cost: () => 12 }), swatch: ['#8A5A2B'],
    style: () => ({ fillColor: '#8A5A2B', fillOpacity: 0.38 }) },
  { id: 'flood', type: 'avoid', name: 'Flood zones (1% annual chance)', src: 'FEMA National Flood Hazard Layer',
    url: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28', where: "SFHA_TF='T'", fields: 'FLD_ZONE,ZONE_SUBTY', page: 1000,
    build: fc => E.fromGeoJSON(fc, null, { kind: 'flood', cost: p => /FLOODWAY/i.test(p.ZONE_SUBTY || '') ? 20 : 8 }), swatch: ['#2F6FB0'],
    style: p => ({ fillColor: '#2F6FB0', fillOpacity: p.cost >= 20 ? 0.4 : 0.26 }) },
  { id: 'etr', type: 'prefer', name: 'Emergency transportation routes', src: 'RDPO and Metro (2025 update)',
    url: 'https://services2.arcgis.com/McQ0OlIABe29rJJy/ArcGIS/rest/services/SSLRs_ETRs/FeatureServer/0', where: '1=1', fields: 'ROUTENAME,ROUTE_TYPE', page: 2000,
    swatch: ['#1E6B45'], line: { color: '#1E6B45', weight: 2.5, opacity: 0.75 }, label: p => p.ROUTENAME },
  { id: 'sslr', type: 'prefer', name: 'State seismic lifeline routes', src: 'ODOT',
    url: 'https://services2.arcgis.com/McQ0OlIABe29rJJy/ArcGIS/rest/services/SSLRs_ETRs/FeatureServer/1', where: '1=1', fields: 'Highway,Tier,Descriptio', page: 2000,
    swatch: ['#0B3B25'], line: { color: '#0B3B25', weight: 4, opacity: 0.7 }, label: p => `${p.Highway} (tier ${p.Tier})` },
  { id: 'fire', type: 'points', name: 'Fire stations', src: 'Oregon State Fire Marshal',
    url: 'https://services.arcgis.com/uUvqNMGPm7axC2dD/arcgis/rest/services/OR_Fire_Stations/FeatureServer/0', where: '1=1', fields: 'Agency,Station,Physical_Address', page: 2000,
    swatch: ['#B43D1A'] },
  { id: 'wui', type: 'image', name: 'Wildland-urban interface (wildfire)', src: 'Oregon Department of Forestry',
    url: 'https://gis.odf.oregon.gov/ags1/rest/services/WebMercator/Fire/MapServer', layer: 6, swatch: ['#C2671B'], off: true }
];
const KIND = { liq5: 'very high liquefaction', liq4: 'high liquefaction', slide: 'mapped landslide', flood: 'flood zone' };
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
const lyBr = L.layerGroup().addTo(map), lyBe = L.layerGroup().addTo(map), lyPeople = L.layerGroup().addTo(map), lyRoutes = L.layerGroup().addTo(map);
const hzRenderer = L.canvas({ padding: 0.3 });

const LD = {};      // per layer: {group, polys, lines, meta, err}
let PREF = [];      // preferred route lines in use
S.layers = S.layers || {};
LAYERS.forEach(l => { if (!S.layers[l.id]) S.layers[l.id] = { show: !l.off, use: true }; LD[l.id] = { group: L.layerGroup() }; });
function geoLines(fc) {
  const out = [];
  for (const f of fc.features || []) { const g = f.geometry; if (!g) continue;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const pts of parts) out.push({ props: f.properties || {}, ll: pts.map(([x, y]) => [y, x]) }); }
  return out;
}
const fireIcon = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:3px;background:#B43D1A;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>', iconSize: [12, 12] });
function drawLayer(l) {
  const d = LD[l.id]; d.group.clearLayers();
  if (l.type === 'avoid' && d.polys) for (const p of d.polys)
    L.polygon(p.rings.map(r => r.map(([x, y]) => [y, x])), { renderer: hzRenderer, stroke: false, interactive: false, ...l.style(p) }).addTo(d.group);
  if (l.type === 'points' && d.points) for (const pt of d.points)
    L.marker(pt.ll, { icon: fireIcon, title: pt.p.Station || 'Fire station' }).bindPopup(`<b>${esc(pt.p.Station || 'Fire station')}</b><br>${esc(pt.p.Agency || '')}<br><small>${esc(pt.p.Physical_Address || '')}</small>`).addTo(d.group);
  if (l.type === 'prefer' && d.lines) for (const ln of d.lines)
    L.polyline(ln.ll, { renderer: hzRenderer, ...l.line, interactive: true }).bindTooltip(esc(l.label(ln.props) || l.name)).addTo(d.group);
  if (S.layers[l.id].show) map.addLayer(d.group); else map.removeLayer(d.group);
}
function rebuildIndex() {
  const polys = []; PREF = [];
  for (const l of LAYERS) { const d = LD[l.id], st = S.layers[l.id];
    if (l.type === 'avoid' && d.polys && st.use) polys.push(...d.polys);
    if (l.type === 'prefer' && d.lines && st.use) PREF.push(...d.lines.map(x => x.ll)); }
  H = polys.length ? E.buildIndex(polys) : null;
  if (typeof lyBr !== 'undefined' && $('#sevDesc')) { drawBridges(); renderSev(); }   // medium-severity closures depend on the liquefaction layer
}
/* wildfire WUI: drawn by the map server as an image for the current view */
let wuiImg = null;
function drawWui() {
  const l = LAYERS.find(x => x.id === 'wui'); if (wuiImg) { map.removeLayer(wuiImg); wuiImg = null; }
  if (!S.layers.wui.show) return;
  const b = map.getBounds(), sz = map.getSize(), sw = map.options.crs.project(b.getSouthWest()), ne = map.options.crs.project(b.getNorthEast());
  const u = `${l.url}/export?` + new URLSearchParams({ bbox: [sw.x, sw.y, ne.x, ne.y].join(','), bboxSR: 3857, imageSR: 3857, size: `${sz.x},${sz.y}`, format: 'png32', transparent: true, layers: 'show:' + l.layer, f: 'image' });
  wuiImg = L.imageOverlay(u, b, { opacity: 0.45, interactive: false }).addTo(map);
}
map.on('moveend', drawWui);
/* ---------- quake severity: which bridges are assumed closed, how much hazard ground matters ---------- */
const SEVERITY = {
  mild: { label: 'Mild', scale: .25, desc: 'Like the 1993 Scotts Mills quake (M5.6): mostly light damage. Bridges are assumed open, but any of them may close briefly for inspection.' },
  medium: { label: 'Medium', scale: .6, desc: 'A strong local quake. Older bridges whose approaches sit on very high liquefaction ground (from the hazard map) are assumed closed; other bridges open with caution.' },
  major: { label: 'Major', scale: 1, desc: "Like DOGAMI's Portland Hills fault M6.8 scenario. Bridges not built or upgraded for earthquakes are assumed closed; quake-ready bridges are assumed to reopen first." },
  severe: { label: 'Severe', scale: 1.4, desc: 'A Cascadia Subduction Zone M9. Older bridges are assumed closed and damage is widespread; quake-ready bridges are assumed to reopen first, after inspection.' }
};
const sev = () => SEVERITY[S.severity] ? S.severity : (S.severity = 'major');
let riskMemo = { H: null, m: {} };
// Liquefaction at a bridge's approaches: sample rings 250 m and 500 m around the bridge point
function approachRisk(b) {
  if (!H) return null;
  if (riskMemo.H !== H) riskMemo = { H, m: {} };
  if (riskMemo.m[b.id]) return riskMemo.m[b.id];
  let liq5 = 0, n = 0;
  for (const r of [250, 500]) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, la = b.lat + r * Math.cos(a) / 110540, ln = b.lng + r * Math.sin(a) / (111320 * Math.cos(b.lat * Math.PI / 180));
    const h = E.hazardAt(H, la, ln); n++; if (h && h.kind === 'liq5') liq5++;
  }
  return (riskMemo.m[b.id] = { liq5, n });
}
function sevOverrides() {
  const v = sev(), o = {};
  for (const b of DATA.bridges) {
    if (b.quake === 'resilient') continue;
    if (v === 'mild') o[b.id] = 'open';
    else if (v === 'medium') { const r = approachRisk(b); o[b.id] = r && r.liq5 >= 3 ? 'closed' : 'open'; }
  }
  return o;
}
const effOv = () => ({ ...sevOverrides(), ...S.overrides });
function bridgeReason(b) {
  if (S.overrides[b.id]) return 'Field report: marked ' + S.overrides[b.id];
  if (b.quake === 'resilient') return 'Built or upgraded for earthquakes: assumed among the first to reopen';
  const v = sev(); if (v === 'mild') return 'Assumed open in a mild quake (may close briefly for inspection)';
  if (v === 'medium') { const r = approachRisk(b); return r ? (r.liq5 >= 3 ? `Assumed closed: ${r.liq5} of ${r.n} approach samples on very high liquefaction ground` : 'Assumed open with caution: approaches mostly off very high liquefaction ground') : 'Load hazard layers to assess approaches'; }
  return `Assumed closed in a ${SEVERITY[v].label.toLowerCase()} quake (not seismically upgraded)`;
}
function renderSev() {
  const v = sev(), ov = effOv(), closed = DATA.bridges.filter(b => !E.bridgeOpen(b, 'car', ov) && b.modes.car || (!b.modes.car && !E.bridgeOpen(b, 'foot', ov))).length;
  $$('#sevSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
  $('#sevDesc').textContent = SEVERITY[v].desc + ` ${closed} of ${DATA.bridges.length} river crossings assumed closed.`;
}
function env() { return { H, prefer: PREF, rivers: DATA.rivers, bridges: DATA.bridges, overrides: effOv(), mode: S.mode, hzScale: SEVERITY[sev()].scale }; }

function drawBridges() {
  lyBr.clearLayers();
  for (const b of DATA.bridges) {
    const open = E.bridgeOpen(b, S.mode, effOv()), carNo = !b.modes[S.mode];
    const col = open ? '#1E6B45' : '#B43D1A';
    const icon = L.divIcon({ className: '', html: `<div class="brg" style="background:${col}"></div>`, iconSize: [16, 16] });
    L.marker([b.lat, b.lng], { icon, title: b.name }).bindPopup(`<b>${esc(b.name)}</b><br>${carNo ? 'Not open to this travel mode' : esc(bridgeReason(b))}${b.note ? '<br><small>' + esc(b.note) + '</small>' : ''}${S.overrides[b.id] ? '<br><small>Field report: marked ' + S.overrides[b.id] + '</small>' : ''}`).addTo(lyBr);
  }
  $('#bridgeList').innerHTML = DATA.bridges.map(b => {
    const o = S.overrides[b.id] || '';
    return `<div class="member" style="grid-template-columns:1fr auto"><div><b>${esc(b.name)}</b><div class="meta">${esc(bridgeReason(b))}${b.id === 'tilikum' ? ' · no cars' : ''}${!b.modes.foot ? ' · freeway, no walking' : ''}</div></div>
    <select data-br="${b.id}" style="width:auto;min-height:36px"><option value="">Scenario</option><option value="open"${o === 'open' ? ' selected' : ''}>Open</option><option value="closed"${o === 'closed' ? ' selected' : ''}>Closed</option></select></div>`;
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

/* ---------- groups: household, other families (neighbors, relatives), out-of-area contacts ---------- */
function groups() {
  if (!Array.isArray(S.groups) || !S.groups.length) S.groups = [{ id: 'home', name: 'My household', kind: 'family' }, { id: 'out', name: 'Out-of-area contacts', kind: 'notify' }];
  return S.groups;
}
const groupOf = m => groups().find(g => g.id === (m && m.group || 'home')) || groups()[0];
const isNotify = m => m !== S.me && groupOf(m).kind === 'notify';
const smsHref = (tel, body) => `sms:${normTel(tel)}${isIOS ? '&' : '?'}body=${encodeURIComponent(body)}`;
const mapLink = (la, ln) => `https://www.openstreetmap.org/?mlat=${la.toFixed(5)}&mlon=${ln.toFixed(5)}#map=16/${la.toFixed(5)}/${ln.toFixed(5)}`;
function whereIs(p) {
  if (p.lat == null) return 'location not shared';
  const near = S.places.map(x => ({ x, d: E.hav([p.lat, p.lng], [x.lat, x.lng]) })).sort((a, b) => a.d - b.d)[0];
  return near && near.d < 300 ? 'at ' + near.x.name : 'near ' + p.lat.toFixed(4) + ', ' + p.lng.toFixed(4);
}
// Plain-language update for relatives and friends outside the area
function statusSummary() {
  const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const me = `${S.me.name || 'I'}${S.me.name ? ' is' : "'m"} ${STATUS[S.me.status] === 'OK' ? 'OK' : STATUS[S.me.status].toLowerCase()}${S.me.lat != null ? ' ' + whereIs(S.me) : ''}`;
  const fam = Object.values(S.members).filter(m => groupOf(m).id === 'home').map(m => m.lat == null ? `${m.name}: not heard from yet` : `${m.name}: ${STATUS[m.status] || 'OK'} ${whereIs(m)} (${ago(m.ts)})`);
  return `Path2Safe update (${t}): ${me}.${fam.length ? ' ' + fam.join('; ') + '.' : ''}${S.meet ? ' Family meeting point: ' + S.meet.name + '.' : ''}${S.me.lat != null ? ' Map: ' + mapLink(S.me.lat, S.me.lng) : ''} Please text rather than call; local lines may be jammed. I'll send another update.`;
}
// Buttons to send one message to a set of people: one Text button each, Email all, Share, Copy
function notifyButtons(people, text, subject) {
  const withTel = people.filter(p => p.tel).slice(0, 8), emails = people.filter(p => p.email && !p.tel).map(p => p.email);
  const key = 'n' + uid(); NOTE[key] = text;
  return `<div class="row" style="margin-top:8px;flex-wrap:wrap">${withTel.map(p => `<a class="btn ghost sm" style="text-decoration:none" href="${smsHref(p.tel, text)}">Text ${esc(p.name)}</a>`).join('')}
    ${emails.length ? `<a class="btn ghost sm" style="text-decoration:none" href="mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject || 'Path2Safe update')}&body=${encodeURIComponent(text)}">Email ${emails.length === 1 ? esc(people.find(p => p.email === emails[0]).name) : emails.length + ' people'}</a>` : ''}
    ${navigator.share ? `<button class="btn ghost sm" data-share="${key}">Share…</button>` : ''}<button class="btn ghost sm" data-copy="${key}">Copy</button></div>
    ${!withTel.length && !emails.length ? '<p class="hint">No phone numbers saved for them yet. Use Share or Copy, or add numbers under Family.</p>' : ''}`;
}
const NOTE = {};
document.addEventListener('click', async e => {
  const s = e.target.closest('[data-share]'), c = e.target.closest('[data-copy]');
  if (s) { try { await navigator.share({ text: NOTE[s.dataset.share] }); } catch (err) { } }
  if (c) { try { await navigator.clipboard.writeText(NOTE[c.dataset.copy]); toast('Copied. Paste it into a message.'); } catch (err) { toast(NOTE[c.dataset.copy], 8000); } }
});

// Small form card used for new groups, adding by phone, and editing people
function formCard(title, html, onSave, extra) {
  $$('.findplace').forEach(b => b.remove());
  const box = document.createElement('div'); box.className = 'card findplace';
  box.innerHTML = `<div class="row" style="justify-content:space-between"><b>${esc(title)}</b><button class="linkbtn" data-x>Cancel</button></div>${html}
    <div class="row" style="margin-top:12px"><button class="btn sm" data-save>Save</button>${extra || ''}</div>`;
  const pane = $('.pane.on'); pane.prepend(box); pane.scrollTop = 0; $('#sheet').classList.remove('min');
  box.querySelector('[data-x]').onclick = () => box.remove();
  box.querySelector('[data-save]').onclick = () => { if (onSave(box) !== false) box.remove(); };
  const f = box.querySelector('input'); if (f) f.focus();
  return box;
}
const groupOptions = sel => groups().map(g => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
function newGroup() {
  formCard('New group', `<label class="f" for="fgName">Name</label><input type="text" id="fgName" maxlength="40" placeholder="e.g. The Garcias next door, Grandparents">
    <label class="f">What's this group for?</label>
    <div class="seg" id="fgKind"><button data-k="family" aria-pressed="true">Family or neighbors</button><button data-k="notify" aria-pressed="false">Out-of-area updates</button></div>
    <p class="hint">Family or neighbors: people you might route to or pick up. Out-of-area: people who just need updates.</p>`, box => {
    const n = box.querySelector('#fgName').value.trim(); if (!n) { box.querySelector('#fgName').focus(); return false; }
    const k = box.querySelector('#fgKind [aria-pressed=true]').dataset.k, id = 'g-' + uid();
    groups().push({ id, name: n.slice(0, 40), kind: k }); save(); renderMembers(); $('#addGroup').value = id; toast(`Group added. Add people to ${n}.`);
  }).querySelector('#fgKind').onclick = e => { const b = e.target.closest('[data-k]'); if (b) $$('#fgKind button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
}
function editGroup(id) {
  const g = groups().find(x => x.id === id); if (!g) return;
  const box = formCard('Edit group', `<label class="f" for="fgName">Name</label><input type="text" id="fgName" maxlength="40" value="${esc(g.name)}">`, b => { const n = b.querySelector('#fgName').value.trim(); if (n) g.name = n.slice(0, 40); save(); renderMembers(); },
    id === 'home' || id === 'out' ? '' : '<button class="btn ghost sm" data-del-g>Delete group</button>');
  const d = box.querySelector('[data-del-g]');
  if (d) d.onclick = () => { Object.values(S.members).forEach(m => { if (m.group === id) m.group = g.kind === 'notify' ? 'out' : 'home'; }); S.groups = groups().filter(x => x.id !== id); save(); box.remove(); renderMembers(); toast('Group deleted. Its people moved to ' + (g.kind === 'notify' ? 'Out-of-area contacts.' : 'My household.')); };
}
function editPerson(id) {
  const m = S.members[id]; if (!m) return;
  const box = formCard('Edit ' + (m.name || 'person'), `<label class="f" for="fpN">Name</label><input type="text" id="fpN" maxlength="40" value="${esc(m.name || '')}">
    <label class="f" for="fpT">Mobile number</label><input type="tel" id="fpT" maxlength="30" value="${esc(m.tel || '')}">
    <label class="f" for="fpE">Email</label><input type="email" id="fpE" maxlength="80" value="${esc(m.email || '')}">
    <label class="f" for="fpG">Group</label><select id="fpG">${groupOptions(m.group || 'home')}</select>`, b => {
    m.name = b.querySelector('#fpN').value.trim().slice(0, 40) || m.name; m.tel = b.querySelector('#fpT').value.trim(); m.email = b.querySelector('#fpE').value.trim(); m.group = b.querySelector('#fpG').value; save(); renderMembers();
  }, '<button class="btn ghost sm" data-rm>Remove</button>');
  box.querySelector('[data-rm]').onclick = () => { delete S.members[id]; save(); box.remove(); renderMembers(); };
}
function addByPhone() {
  formCard('Add by name and phone', `<label class="f" for="fpN">Name</label><input type="text" id="fpN" maxlength="40">
    <label class="f" for="fpT">Mobile number</label><input type="tel" id="fpT" maxlength="30">
    <label class="f" for="fpE">Email (optional)</label><input type="email" id="fpE" maxlength="80">
    <label class="f" for="fpG">Group</label><select id="fpG">${groupOptions($('#addGroup').value)}</select>`, b => {
    const n = b.querySelector('#fpN').value.trim(), t = b.querySelector('#fpT').value.trim(), e = b.querySelector('#fpE').value.trim();
    if (!n) { b.querySelector('#fpN').focus(); return false; }
    const id = 'p-' + uid(); S.members[id] = { id, name: n.slice(0, 40), tel: t, email: e, group: b.querySelector('#fpG').value, status: 'none', src: 'added by hand' }; save(); renderMembers();
  });
}

/* ---------- family registration: saved on the phone and sent to The Prepared House (Google Form → Sheet) ---------- */
const REG = { action: 'https://docs.google.com/forms/d/e/1FAIpQLScs7Q9tpp7DLg55XYlQGIQHujYcUCtt1FJEaMNLWZa_mr2xgg/formResponse',
  e: { name: '2114033280', email: '1508725619', phone: '855516645', address: '1521778919', household: '1899940286', kids: '1551526006', contact: '1714331836', sethome: '323869231', setmeet: '124083277', regid: '988753466', source: '1429914310' } };
async function sendReg() {
  const r = S.reg; if (!r || !r.pending || !navigator.onLine) return;
  const body = new URLSearchParams();
  for (const [k, id] of Object.entries(REG.e)) if (r[k] != null && r[k] !== '') body.append('entry.' + id, r[k]);
  try { await fetch(REG.action, { method: 'POST', mode: 'no-cors', body }); r.pending = false; r.sentAt = Date.now(); save(); renderReg(); } catch (e) { }
}
addEventListener('online', sendReg);
function renderReg() {
  const r = S.reg, top = $('#regCard'), set = $('#regSetup'); if (!top || !set) return;
  top.innerHTML = r || S.regLater ? '' : `<div class="card"><b>Register your family</b><p class="hint" style="margin:4px 0 10px">Save your household's contact details and home address with The Prepared House, and set up home and your reunite location in one step.</p>
    <div class="row"><button class="btn sm" data-reg>Register</button><button class="linkbtn" data-reglater>Later</button></div></div>`;
  set.innerHTML = r ? `<div class="card"><b>${esc(r.name)}</b><div class="meta">${esc(r.email)} · ${esc(r.phone)}</div><div class="meta">${esc(r.address)}</div>
    <div class="meta">${r.pending ? 'Waiting for a connection to send' : 'Registered ' + new Date(r.sentAt || r.ts).toLocaleDateString()}${r.contact === 'Yes' ? ' · OK to contact' : ''}</div>
    <div class="row" style="margin-top:8px"><button class="btn ghost sm" data-reg>Edit registration</button></div></div>`
    : `<p class="hint">Not registered yet.</p><button class="btn sm" data-reg>Register your family</button>`;
}
function regForm() {
  const r = S.reg || {}, seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([v, t]) => `<button data-v="${v}" aria-pressed="${v === cur}">${t}</button>`).join('')}</div>`;
  const box = formCard(S.reg ? 'Edit registration' : 'Register your family', `
    <label class="f" for="rgN">Your name</label><input type="text" id="rgN" maxlength="60" autocomplete="name" value="${esc(r.name || S.me.name || '')}">
    <label class="f" for="rgE">Email</label><input type="email" id="rgE" maxlength="100" autocomplete="email" value="${esc(r.email || '')}">
    <label class="f" for="rgP">Mobile phone</label><input type="tel" id="rgP" maxlength="30" autocomplete="tel" value="${esc(r.phone || S.me.tel || '')}">
    <label class="f" for="rgA">Home address</label><input type="text" id="rgA" maxlength="160" autocomplete="street-address" placeholder="Street, city, ZIP" value="${esc(r.address || '')}">
    <label class="f" for="rgH">People in your household (optional)</label><input type="number" id="rgH" min="1" max="20" inputmode="numeric" value="${esc(r.household || '')}">
    <label class="f">Children in school or child care? (optional)</label>${seg('rgK', [['Yes', 'Yes'], ['No', 'No']], r.kids)}
    <label class="f">Save this address as Home in the app?</label>${seg('rgSH', [['Yes', 'Yes'], ['No', 'No']], r.sethome || 'Yes')}
    <label class="f">Where should your family reunite?</label>${seg('rgSM', [['Home', 'At home'], ['Another place', 'Somewhere else'], ['Not now', 'Not now']], r.setmeet || 'Home')}
    <label class="check"><input type="checkbox" id="rgC"${r.contact === 'Yes' ? ' checked' : ''}> The Prepared House may contact me about home preparedness services.</label>
    <p class="hint">Name, email, phone and home address are required. The Prepared House keeps your details to support your family plan and, only if you tick the box, to contact you about its services. Your family's live locations stay on your phones.</p>
    <p class="warn" id="rgErr"></p>`, b => {
    const v = id => b.querySelector(id).value.trim(), pick = id => (b.querySelector(id + ' [aria-pressed=true]') || {}).dataset?.v || '';
    const d = { name: v('#rgN'), email: v('#rgE'), phone: v('#rgP'), address: v('#rgA'), household: v('#rgH'), kids: pick('#rgK') || 'Not answered', sethome: pick('#rgSH'), setmeet: pick('#rgSM'), contact: b.querySelector('#rgC').checked ? 'Yes' : 'No' };
    const err = !d.name ? 'Please add your name.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) ? 'Please check your email address.' : normTel(d.phone).replace(/\D/g, '').length < 10 ? 'Please add a phone number with area code.' : d.address.length < 6 ? 'Please add your home address.' : '';
    if (err) { b.querySelector('#rgErr').textContent = err; return false; }
    S.reg = { ...r, ...d, regid: r.regid || 'P2S-' + uid().toUpperCase(), source: 'Reunite app ' + location.host, ts: Date.now(), pending: true };
    if (!S.me.name) S.me.name = d.name.split(' ')[0]; S.me.tel = d.phone;
    save(); renderMembers(); renderReg(); sendReg(); afterReg(d);
  });
  box.addEventListener('click', e => { const s = e.target.closest('.seg [data-v]'); if (s) s.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === s)); });
}
// After registering: set Home from the address, and the reunite location, as the family chose
async function afterReg(d) {
  let home = S.places.find(p => /^home$/i.test(p.name));
  if (d.sethome === 'Yes') {
    const hits = navigator.onLine ? await geocode(d.address) : null, h = hits && hits.find(x => !x.far);
    if (h) { if (home) Object.assign(home, { lat: h.lat, lng: h.lng, addr: d.address }); else S.places.push(home = { id: uid(), name: 'Home', lat: h.lat, lng: h.lng, addr: d.address }); save(); renderPlaces(); toast('Registered. Home saved from your address.'); }
    else { toast("Registered. We couldn't place that address on the map, so tap your home."); goTab('setup'); return findPlace({ title: 'Where is home?', nameLabel: 'Name', mapPrompt: 'Tap your home', done: (n, la, ln, label) => { S.places.push(home = { id: uid(), name: n || 'Home', lat: la, lng: ln, addr: d.address }); save(); renderPlaces(); if (d.setmeet === 'Home') setMeet(home); } }); }
  } else toast('Registered. Thank you.');
  if (d.setmeet === 'Home' && home) { setMeet(home); toast('Registered. Home is saved and set as your reunite location.'); }
  else if (d.setmeet === 'Another place') { goTab('reunite'); startPlan('meet'); $('#pickMeet').click(); }
  renderMembers();
}
document.addEventListener('click', e => { if (e.target.closest('[data-reg]')) regForm(); if (e.target.closest('[data-reglater]')) { S.regLater = true; save(); renderReg(); } });

/* ---------- family list ---------- */
function renderMembers() {
  $('#myName').value = S.me.name || '';
  $$('#mySt button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === S.me.status));
  $('#myLoc').textContent = S.me.lat != null ? `Your spot: ${S.me.lat.toFixed(5)}, ${S.me.lng.toFixed(5)} · ${S.me.src || ''} · ${ago(S.me.ts)}${hzWarn(S.me)}` : 'No location yet.';
  const row = m => {
    const out = isNotify(m), has = m.lat != null, stale = has && m.ts && Date.now() - m.ts > CFG.staleMin * 60000;
    const tag = out ? '<span class="tag none">Gets updates</span>' : has ? `<span class="tag ${m.status}">${STATUS[m.status] || 'OK'}</span>` : '<span class="tag none">Not checked in</span>';
    const meta = has && !out ? [m.note, m.src, ago(m.ts)].filter(Boolean).map(esc).join(' · ') + hzWarn(m) : esc([m.tel, m.email].filter(Boolean).join(' · ') || 'No phone saved');
    const act = out ? (m.tel ? `<a class="btn ghost sm" style="text-decoration:none" href="${smsHref(m.tel, statusSummary())}">Text update</a>` : m.email ? `<a class="btn ghost sm" style="text-decoration:none" href="mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Path2Safe update')}&body=${encodeURIComponent(statusSummary())}">Email update</a>` : '')
      : has ? `<button class="btn ghost sm" data-goto="${m.id}" aria-label="Plan a route to ${esc(m.name)}">Go to</button><button class="btn ghost sm" data-zoom="${m.id}" aria-label="Show ${esc(m.name)} on the map">Show</button>`
      : `<button class="btn ghost sm" data-invite="${m.id}" aria-label="Invite ${esc(m.name)}">Invite</button>`;
    return `<div class="member"><div class="dot${has && !out ? '' : ' none'}" style="background:${colorOf(m.id)}">${esc((m.name || '?').slice(0, 2).toUpperCase())}</div>
      <div><b>${esc(m.name)}</b> ${tag}${stale && !out ? ' <span class="tag stale">last seen ' + ago(m.ts) + '</span>' : ''}
      <div class="meta">${meta}</div></div>
      <div class="row">${act}<button class="btn ghost sm" data-edit="${m.id}" aria-label="Edit ${esc(m.name)}">Edit</button></div></div>`;
  };
  $('#members').innerHTML = groups().map(g => {
    const ms = Object.values(S.members).filter(m => groupOf(m).id === g.id);
    return `<div class="ghead"><b>${esc(g.name)}</b><button class="linkbtn" data-gedit="${esc(g.id)}">Rename</button></div>
      ${ms.length ? ms.map(row).join('') : `<p class="hint" style="margin:4px 0 10px">${g.kind === 'notify' ? 'Add a relative or friend outside the area who can relay news. They get text updates and need no app.' : g.id === 'home' ? 'No one yet. Add people from your contacts, by phone, or paste a text check-in.' : 'No one yet.'}</p>`}`;
  }).join('');
  const ag = $('#addGroup'), cur = ag.value; ag.innerHTML = groupOptions(cur || 'home');
  renderCheckin(); renderMeetSel(); renderPlan(); drawPeople(); renderSetup();
}
function hzWarn(p) { if (!H || p.lat == null) return ''; const h = E.hazardAt(H, p.lat, p.lng); return h ? ` · inside a ${KIND[h.kind]} area` : ''; }

/* ---------- GPS ---------- */
let watchId = null;
function startGps() {
  if (!navigator.geolocation) return toast('This browser has no GPS access.');
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; setGpsPill(); $('#gpsBtn').textContent = 'Share location'; return; }
  $('#gpsBtn').textContent = 'Stop sharing';
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
    for (let [id, m] of Object.entries(j.members || {})) if (id !== S.me.id && m && typeof m.lat === 'number') {
      const twin = findByName(m.name);
      if (twin && twin.id !== id && twin.lat == null) { delete S.members[twin.id]; m = { tel: twin.tel, email: twin.email, ...m }; }
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
  const outs = Object.values(S.members).filter(isNotify), sum = statusSummary();
  $('#outText').textContent = sum;
  $('#outBtns').innerHTML = outs.length ? notifyButtons(outs, sum, 'Path2Safe update') : `<p class="hint">No out-of-area contacts yet. <button class="linkbtn" data-goout>Add one under Family</button></p>` + notifyButtons([], sum);
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

/* ---------- hazard and route layers: download once, keep for offline ---------- */
const layerKey = l => 'L2:' + l.id;   // v2 = three-county extent
async function fetchLayer(l) {
  let feats = [], off = 0, more = true;
  while (more && off < 40000) {
    const u = l.url + '/query?' + new URLSearchParams({ where: l.where, geometry: CFG.hzBounds, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: l.fields, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5, resultOffset: off, resultRecordCount: l.page, f: 'geojson' });
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
    try { const j = await (await fetch(u, { signal: ctl.signal })).json(); if (j.error) throw new Error(j.error.message);
      feats = feats.concat(j.features || []); more = !!(j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit)); off += l.page; }
    finally { clearTimeout(to); }
  }
  return { type: 'FeatureCollection', features: feats };
}
function useLayer(l, fc, meta) {
  const d = LD[l.id]; d.meta = meta; d.err = null;
  if (l.type === 'avoid') d.polys = l.build(fc);
  else if (l.type === 'points') d.points = (fc.features || []).filter(f => f.geometry).map(f => ({ p: f.properties || {}, ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]] }));
  else d.lines = geoLines(fc);
  drawLayer(l);
}
async function loadHazards(force) {
  const pill = $('#pHz'); let ok = 0, need = 0;
  for (const l of LAYERS) {
    if (l.type === 'image') continue; need++;
    if (!force) { try { const c = await idb.get(layerKey(l)); if (c) { useLayer(l, c.fc, c.meta); ok++; continue; } } catch (e) { } }
    if (!navigator.onLine) { LD[l.id].err = 'not saved yet'; continue; }
    pill.className = 'pill warn'; pill.textContent = 'Downloading ' + l.name.split(' ')[0].toLowerCase() + '…'; renderLayerList();
    try { const fc = await fetchLayer(l), meta = { when: Date.now(), n: fc.features.length };
      try { await idb.set(layerKey(l), { fc, meta }); } catch (e) { }
      useLayer(l, fc, meta); ok++;
    } catch (e) { LD[l.id].err = e.name === 'AbortError' ? 'timed out' : e.message; }
  }
  rebuildIndex();
  pill.className = 'pill ' + (ok === need ? 'ok' : ok ? 'warn' : 'bad');
  pill.textContent = ok === need ? 'Hazards saved' : ok ? `Hazards ${ok}/${need}` : 'No hazard data';
  if (force && ok) toast(ok === need ? 'All map layers saved for offline use.' : `${ok} of ${need} layers saved. Try the rest again later.`);
  renderLayerList(); renderMembers();
}
function useHazards(fc, meta) { const l = LAYERS[0]; useLayer(l, fc, meta); rebuildIndex(); renderLayerList(); renderMembers(); } // tests
function renderLayerList() {
  $('#layerList').innerHTML = LAYERS.map(l => {
    const d = LD[l.id], st = S.layers[l.id];
    const status = l.type === 'image' ? 'Live from the map server; not saved offline'
      : d.err ? 'Not available: ' + esc(d.err) : d.meta ? `${d.meta.n.toLocaleString()} features · saved ${new Date(d.meta.when).toLocaleDateString()}` : 'Waiting to download…';
    const use = l.type === 'avoid' ? 'Avoid in routes' : l.type === 'prefer' ? 'Prefer in routes' : '';
    if (l.type === 'points') { /* shown only */ }
    const sw = l.swatch.map(c => l.type === 'prefer' ? `<span class="sw" style="background:${c};height:4px"></span>` : `<span class="sw" style="background:${c};opacity:.6"></span>`).join('');
    return `<div class="member" style="grid-template-columns:22px 1fr"><div style="display:grid;gap:3px">${sw}</div><div><b>${esc(l.name)}</b><div class="meta">${esc(l.src)} · ${status}</div>
      <div class="row" style="gap:16px;margin-top:4px"><label class="meta"><input type="checkbox" data-show="${l.id}"${st.show ? ' checked' : ''}> Show</label>${use ? `<label class="meta"><input type="checkbox" data-use="${l.id}"${st.use ? ' checked' : ''}> ${use}</label>` : ''}</div></div></div>`;
  }).join('');
}

/* ---------- routing ---------- */
async function streetRoute(pts, mode, alts) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try {
    const u = CFG.osrm[mode] + pts.map(p => p[1].toFixed(5) + ',' + p[0].toFixed(5)).join(';') + '?overview=full&geometries=geojson&steps=true&continue_straight=false' + (alts && pts.length === 2 ? '&alternatives=2' : '');
    const j = await (await fetch(u, { signal: ctl.signal })).json();
    if (j.code !== 'Ok' || !j.routes.length) return null;
    return j.routes.map(r => {
      const steps = [], legs = r.legs || [];
      legs.forEach((lg, li) => lg.steps.forEach(st => {
        const t = st.maneuver.type;
        if ((t === 'arrive' && li < legs.length - 1) || (t === 'depart' && li > 0)) { if (steps.length && st.distance) steps[steps.length - 1].dist += st.distance; return; }   // hide via-point stops
        steps.push({ type: t, mod: st.maneuver.modifier || '', brg: st.maneuver.bearing_after, name: st.name || '', ref: st.ref || '', dest: st.destinations || '', exit: st.maneuver.exit, dist: st.distance, line: (st.geometry && st.geometry.coordinates || []).map(([x, y]) => [y, x]) });
      }));
      return { line: r.geometry.coordinates.map(([x, y]) => [y, x]), dur: r.duration, dist: r.distance, steps };
    });
  } catch (e) { return null; } finally { clearTimeout(to); }
}
// Street names catch bridges the approximate river line can miss (e.g. Ross Island, where the river splits).
const BKEY = { i205: 'glenn', ocarch: 'oregon city', stjohns: 'st johns', i5: 'interstate bridge', steel: 'steel bridge', broadway: 'broadway bridge', fremont: 'fremont bridge' };
function bridgesByName(steps) {
  const hit = new Set();
  for (const s of steps || []) {
    const nm = String(s.name || '').toLowerCase().replace(/\./g, ''); if (!/bridge|crossing/.test(nm)) continue;
    for (const b of DATA.bridges) {
      const key = BKEY[b.id] || b.name.toLowerCase().replace(/\./g, '').replace(/ \(.*$/, '').replace(/ (bridge|crossing)$/, '');
      if (nm.includes(key) && s.line.some(pt => E.hav(pt, [b.lat, b.lng]) < 1500)) hit.add(b);
    }
  }
  return [...hit];
}
function evaluate(line, en, steps) {
  const ex = E.exposure(H, line), cx = E.crossings(line, en);
  const named = bridgesByName(steps).map(b => ({ bridge: b, open: E.bridgeOpen(b, en.mode, en.overrides) }));
  for (const n of named) if (!cx.some(c => c.bridge && c.bridge.id === n.bridge.id)) cx.push(n);
  const bad = cx.filter(c => c.bridge && !c.open), used = cx.filter(c => c.bridge && c.open).map(c => c.bridge.name);
  return { ex, bad, used: [...new Set(used)], score: E.score(ex) + (bad.length ? 1e7 : 0) };
}

/* ---------- what to plan: meet up, go to someone, or pick up ---------- */
const SCHOOLISH = /school|elementary|middle|high|academy|preschool|day ?care|child ?care|daycare|reunification|campus|college/i;
function plan() { S.plan = S.plan || { goal: 'meet', person: null, place: null, then: null, who: null, kids: [] }; return S.plan; }
const located = () => [S.me, ...Object.values(S.members)].filter(p => p.lat != null && !isNotify(p));
const byId = id => id === S.me.id ? S.me : S.members[id];
const nameOf = p => p === S.me ? (S.me.name && !/^you$/i.test(S.me.name) ? S.me.name + ' (you)' : 'You') : (p.name || '?');
function defaultWho(g) {
  const pl = plan(), ppl = located();
  if (g === 'person') return ppl.filter(p => p.id !== pl.person && p.status !== 'injured').map(p => p.id);
  if (g === 'pickup') return ppl.length ? [(S.me.lat != null ? S.me : ppl[0]).id] : [];
  return ppl.map(p => p.id);
}
function whoIds() { const pl = plan(), ok = new Set(located().map(p => p.id)); return (pl.who || defaultWho(pl.goal)).filter(id => ok.has(id) && !(pl.goal === 'person' && id === pl.person)); }
function thenTarget() {
  const pl = plan(), v = pl.then ?? (S.meet ? 'meet' : (S.places.find(p => /home/i.test(p.name) && p.id !== pl.place) ? 'pl:' + S.places.find(p => /home/i.test(p.name) && p.id !== pl.place).id : 'none'));
  if (v === 'meet') return S.meet ? { key: v, name: S.meet.name, lat: S.meet.lat, lng: S.meet.lng } : null;
  const p = v.startsWith('pl:') && S.places.find(x => x.id === v.slice(3));
  return p ? { key: v, name: p.name, lat: p.lat, lng: p.lng } : null;
}
function renderPlan() {
  const pl = plan(), g = pl.goal;
  $$('#goalSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === g));
  $('#gMeet').hidden = g !== 'meet'; $('#gPerson').hidden = g !== 'person'; $('#gPickup').hidden = g !== 'pickup';
  const rank = { injured: 0, help: 1, ok: 2 };
  const ms = Object.values(S.members).filter(m => m.lat != null && !isNotify(m)).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
  if (!ms.some(m => m.id === pl.person)) pl.person = ms[0] ? ms[0].id : null;
  const ref = S.me.lat != null ? [S.me.lat, S.me.lng] : null;
  $('#personSel').innerHTML = ms.length ? ms.map(m => `<option value="${esc(m.id)}"${m.id === pl.person ? ' selected' : ''}>${esc(m.name)} · ${STATUS[m.status] || 'OK'}${ref ? ' · ' + fmtKm(E.hav(ref, [m.lat, m.lng])) + ' away' : ''}</option>`).join('') : '<option value="">No family member has shared a location yet</option>';
  const places = [...S.places].sort((a, b) => SCHOOLISH.test(b.name) - SCHOOLISH.test(a.name));
  if (!places.some(p => p.id === pl.place)) pl.place = places[0] ? places[0].id : null;
  $('#pickSel').innerHTML = places.length ? places.map(p => `<option value="${esc(p.id)}"${p.id === pl.place ? ' selected' : ''}>${esc(p.name)}</option>`).join('') : '<option value="">Save the school first</option>';
  const th = thenTarget(), opts = [S.meet ? `<option value="meet">Meeting point: ${esc(S.meet.name)}</option>` : '', ...S.places.filter(p => p.id !== pl.place).map(p => `<option value="pl:${esc(p.id)}">${esc(p.name)}</option>`), '<option value="none">Nowhere yet (route there only)</option>'];
  $('#thenSel').innerHTML = opts.join(''); $('#thenSel').value = th ? th.key : 'none';
  const kids = Object.values(S.members).filter(m => !isNotify(m));
  $('#kidChips').innerHTML = kids.length ? kids.map(m => `<button class="chip" data-kid="${esc(m.id)}" aria-pressed="${pl.kids.includes(m.id)}">${esc(m.name)}${groupOf(m).id !== 'home' ? ' · ' + esc(groupOf(m).name) : ''}</button>`).join('') : '<p class="hint" style="margin:0">Add your children under Family (they don\'t need a phone).</p>';
  const who = new Set(whoIds()), all = [S.me, ...Object.values(S.members).filter(m => !isNotify(m))];
  $('#whoChips').innerHTML = all.map(p => {
    const off = p.lat == null || (g === 'person' && p.id === pl.person);
    return `<button class="chip" data-who="${esc(p.id)}" aria-pressed="${who.has(p.id)}"${off ? ' disabled title="' + (p.lat == null ? 'No location yet' : 'Destination') + '"' : ''}>${esc(nameOf(p))}</button>`;
  }).join('');
  $('#planBtn').textContent = g === 'person' ? 'Plan routes to them' : g === 'pickup' ? 'Plan the pickup' : 'Plan routes';
}

/* ---------- directions: compass headings, turn by turn ---------- */
const DIR8 = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compass = b => DIR8[Math.round(((b % 360) + 360) % 360 / 45) % 8];
const bearing = (a, b) => { const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r); return (Math.atan2(y, x) / r + 360) % 360; };
const TURN = { 'straight': 'Continue', 'slight left': 'Bear left', 'slight right': 'Bear right', 'left': 'Turn left', 'right': 'Turn right', 'sharp left': 'Turn sharp left', 'sharp right': 'Turn sharp right', 'uturn': 'Make a U-turn' };
function roadName(s) { const n = tidy(s.name), r = s.ref ? s.ref.split(';')[0] : ''; return n && r && !n.includes(r) ? `${n} (${r})` : n || r; }
function stepText(s, destName) {
  const dir = compass(s.brg), road = roadName(s), on = road ? ' on ' + road : '', onto = road ? ' onto ' + road : '', to = s.dest ? ' toward ' + s.dest.split(',')[0] : '', side = /left/.test(s.mod) ? 'left' : /right/.test(s.mod) ? 'right' : '';
  switch (s.type) {
    case 'depart': return `Head ${dir}${on || ' on the nearest street or path'}`;
    case 'arrive': return `Arrive at ${destName}`;
    case 'new name': case 'continue': return s.mod && s.mod !== 'straight' && TURN[s.mod] ? `${TURN[s.mod]} to stay heading ${dir}${on}` : `Continue ${dir}${on}`;
    case 'on ramp': return `Take the ramp heading ${dir}${to || onto}`;
    case 'off ramp': return `Take the exit heading ${dir}${to || onto}`;
    case 'merge': return `Merge heading ${dir}${onto}`;
    case 'fork': return `Keep ${side || 'straight'} at the fork, heading ${dir}${onto}`;
    case 'end of road': return `At the end of the road, turn ${side || 'onto the cross street'} heading ${dir}${onto}`;
    case 'roundabout': case 'rotary': case 'exit roundabout': case 'roundabout turn': return `At the roundabout, take ${s.exit ? 'exit ' + s.exit : 'the exit'} heading ${dir}${onto}`;
    default: return `${TURN[s.mod] || 'Continue'}${road ? ' onto ' + road + ', heading ' + dir : ' onto the path or lane heading ' + dir}`;
  }
}
// Offline or corridor-only: compass legs from the line itself
function corridorSteps(line, destName) {
  const segs = [];
  for (let k = 0; k < line.length - 1; k++) {
    const d = E.hav(line[k], line[k + 1]); if (d < 1) continue;
    const b = bearing(line[k], line[k + 1]), c = compass(b), last = segs[segs.length - 1];
    if (last && (last.c === c || d < 120)) { last.dist += d; last.line.push(line[k + 1]); } else segs.push({ c, brg: b, dist: d, line: [line[k], line[k + 1]] });
  }
  for (let i = segs.length - 1; i > 0; i--) if (segs[i].dist < 150) { segs[i - 1].dist += segs[i].dist; segs[i - 1].line.push(...segs[i].line.slice(1)); segs.splice(i, 1); }
  return segs.map((g, i) => {
    let t; if (!i) t = `Head ${g.c}`; else { const dlt = ((g.brg - segs[i - 1].brg + 540) % 360) - 180; t = `${Math.abs(dlt) < 60 ? 'Bear' : 'Turn'} ${dlt > 0 ? 'right' : 'left'} and head ${g.c}`; }
    return { text: t, dist: g.dist, line: g.line };
  }).concat([{ text: 'Arrive at ' + destName, dist: 0, line: [] }]);
}
// Fold tiny jogs (footpaths, slip lanes) and repeated street names so directions stay readable.
function simplify(raw) {
  const st = raw.map(s => ({ ...s, line: s.line.slice() }));
  for (let i = st.length - 2; i > 0; i--) if (st[i].dist < 60) { const prev = st[i - 1]; prev.dist += st[i].dist; prev.line.push(...st[i].line.slice(1)); st.splice(i, 1); }
  const out = [];
  for (const s of st) {
    const last = out[out.length - 1], same = last && s.type !== 'arrive' && roadName(s) === roadName(last);
    if (same && (roadName(s) || compass(s.brg) === compass(last.brg))) { last.dist += s.dist; last.line.push(...s.line.slice(1)); continue; }
    out.push(s);
  }
  return out;
}
function annotate(steps, en) {
  for (const s of steps) {
    s.warn = []; if (s.line.length < 2) continue;
    const ex = E.exposure(H, s.line);
    for (const [k, m] of Object.entries(ex.by).sort((a, b) => b[1] - a[1])) if (m >= 60) s.warn.push(`${fmtKm(m)} through ${KIND[k] || k}`);
    const bs = new Set([...E.crossings(s.line, en).filter(c => c.bridge).map(c => c.bridge), ...bridgesByName([{ name: s.road || '', line: s.line }])]);
    for (const b of bs) s.warn.push(`crosses ${b.name}`);
  }
  return steps;
}

/* ---------- route options for one traveler ---------- */
function similar(a, b) { return Math.abs(a.dist - b.dist) / Math.max(a.dist, 1) < .03 && Math.abs(a.ex.total - b.ex.total) < 80; }
async function routeLeg(target, travelers, en, label) {
  const tgt = [target.lat, target.lng], online = navigator.onLine;
  const bounds = E.padBounds([tgt, ...travelers.map(p => [p.lat, p.lng])], 2500);
  const G = E.buildGrid(bounds, en, 320), D = E.dijkstra(G, E.nearestDry(G, tgt[0], tgt[1]));
  const G2 = E.buildGrid(bounds, { ...en, hzPow: 1.7 }, 320), D2 = E.dijkstra(G2, E.nearestDry(G2, tgt[0], tgt[1]));
  const out = []; let G3, D3;
  const lineFrom = (g, d, p) => { const path = E.trace(g, d, E.nearestDry(g, p.lat, p.lng)); return path && [[p.lat, p.lng], ...E.toLatLngs(g, E.smooth(g, path)).slice(1, -1), tgt]; };
  for (const p of travelers) {
    const col = p === S.me ? '#1E6B45' : p.legCol || colorOf(p.id);
    const corr = [[G, D], [G2, D2]].map(([g, d]) => lineFrom(g, d, p));
    if (!corr[0]) {   // every usable crossing is blocked: still find the best path, allowing at-risk bridges, and flag them
      if (!G3) { const enR = { ...en, overrides: Object.fromEntries(DATA.bridges.map(b => [b.id, S.overrides[b.id] === 'closed' ? 'closed' : 'open'])) }; G3 = E.buildGrid(bounds, enR, 320); D3 = E.dijkstra(G3, E.nearestDry(G3, tgt[0], tgt[1])); }
      corr[0] = lineFrom(G3, D3, p);
    }
    let opts = [], risk = [];
    if (online) {
      // if the trip crosses a river, also try each other open bridge within a sensible detour
      const crossesRiver = E.crossings(corr[0], en).some(c => c.bridge), here = [p.lat, p.lng], straight = E.hav(here, tgt);
      const viaBridges = crossesRiver ? DATA.bridges.filter(b => E.bridgeOpen(b, en.mode, en.overrides)).map(b => ({ b, d: E.hav(here, [b.lat, b.lng]) + E.hav([b.lat, b.lng], tgt) })).filter(x => x.d < straight * 1.8 + 2000).sort((a, b) => a.d - b.d).slice(0, 3) : [];
      const jobs = [streetRoute([here, tgt], S.mode, true), streetRoute(E.viaPoints(corr[0], en), S.mode), corr[1] ? streetRoute(E.viaPoints(corr[1], en), S.mode) : null, ...viaBridges.map(x => streetRoute([here, [x.b.lat, x.b.lng], tgt], S.mode))];
      const res = await Promise.all(jobs);
      res.forEach((rs, i) => (rs || []).forEach(c => opts.push({ kind: i < 3 ? ['street-direct', 'street-safe', 'street-cautious'][i] : 'street-bridge', line: c.line, dist: c.dist, dur: c.dur, steps: c.steps, ...evaluate(c.line, en, c.steps) })));
      risk = opts.filter(o => o.bad.length).sort((a, b) => a.dur - b.dur); opts = opts.filter(o => !o.bad.length);
    }
    if (!opts.length) corr.forEach((ln, i) => ln && opts.push({ kind: i ? 'corridor-cautious' : 'corridor', line: ln, ...evaluate(ln, en) }));
    if (!opts.length && !risk.length) { const ln = [[p.lat, p.lng], tgt]; opts.push({ kind: 'straight', line: ln, ...evaluate(ln, en) }); }   // no mapped path at all: compass bearing
    if (opts.every(o => o.bad.length) && risk.length) opts.unshift(risk.shift());   // a street route with real directions beats a risky corridor
    else if (risk.length && risk[0].dur < .75 * Math.min(...opts.map(o => o.dur || o.ex.len / (CFG.speed[S.mode] / 3.6)))) risk = [risk[0]]; else risk = [];
    const prep = o => { if (o.kind === 'straight') { o.dist = o.ex.len; o.dur = o.dist / (CFG.speed[S.mode] / 3.6); o.steps = [{ text: `Head ${compass(bearing(o.line[0], o.line[1]))} toward ${target.name} (${fmtKm(o.dist)} in a straight line)`, dist: o.dist, line: o.line }, { text: 'Arrive at ' + target.name, dist: 0, line: [] }]; }
      else if (o.kind.startsWith('corridor')) { o.dist = o.ex.len; o.dur = o.dist / (CFG.speed[S.mode] / 3.6); o.steps = corridorSteps(o.line, target.name); }
      else o.steps = simplify(o.steps).map(s => ({ text: stepText(s, target.name), road: s.name, ref: s.ref, dist: s.dist, line: s.line }));
      annotate(o.steps, en); };
    opts.forEach(prep);
    // among risky options, a street route with real directions ranks above a compass-only line
    const rk = o => o.score + (o.bad.length && !o.kind.startsWith('street') ? 5e6 : 0);
    opts.sort((a, b) => rk(a) - rk(b));
    const keep = []; for (const o of opts) if (!keep.some(k => similar(k, o))) keep.push(o);
    opts = keep.slice(0, 3);
    if (risk.length && !opts.some(k => similar(k, risk[0]))) { prep(risk[0]); opts.push(risk[0]); }
    const okO = opts.filter(o => !o.bad.length && o.kind !== 'straight'), fast = okO.length > 1 ? okO.reduce((a, b) => b.dur < a.dur ? b : a) : null, calm = okO.length > 1 ? okO.reduce((a, b) => b.ex.total < a.ex.total ? b : a) : null;
    opts.forEach((o, i) => { o.tags = [];
      if (o.bad.length) { o.tags.push(!i ? 'Best available: risky' : !o.kind.startsWith('street') ? 'Compass-only backup' : opts[0].bad.length ? 'Risky alternative' : `Only if ${o.bad.map(c => c.bridge.name).join(' and ')} ${o.bad.length > 1 ? 'are' : 'is'} open`); return; }
      if (o.kind === 'straight') { o.tags.push('No mapped path: compass only'); return; }
      if (!i) o.tags.push('Recommended'); if (o === fast) o.tags.push('Fastest'); if (o === calm) o.tags.push('Fewest hazards'); if (!o.tags.length) o.tags.push('Backup route'); });
    out.push({ p, col, label, target, opts, sel: 0 });
  }
  return out;
}

/* ---------- safety notices ---------- */
function generalSafety() {
  const m = S.mode, items = [
    'Expect aftershocks. If shaking starts: Drop, Cover and Hold On.' + (m === 'car' ? ' In a car, pull over in a clear spot away from buildings, trees, overpasses and power lines.' : ''),
    "Don't enter damaged buildings. Stay well clear of downed power lines and anything touching them.",
    'Never walk or drive into floodwater: 6 inches of moving water can knock you off your feet, and 12 inches can carry away a car.',
    m === 'car' ? "Bridges and overpasses can be damaged even when they look fine. Stop if you see cracks, gaps, sagging or a drop at the joints, and expect closures and detours." : 'Wear sturdy, thick-soled shoes and gloves, and carry water, a flashlight and a whistle.',
    'Text rather than call; save calls for emergencies. Send a check-in when you leave and when you arrive.'];
  return `<details class="safety"><summary><b>Safety before you go</b></summary><ul>${items.map(t => `<li>${t}</li>`).join('')}</ul><p class="src">Sources: National Weather Service (Turn Around Don't Drown), Ready.gov earthquake guidance.</p></details>`;
}
function routeSafety(o) {
  const n = [], by = o.ex.by;
  if ((by.liq5 || 0) + (by.liq4 || 0) >= 100) n.push(`Crosses ${fmtKm((by.liq5 || 0) + (by.liq4 || 0))} of liquefaction-prone ground: expect cracked or buckled pavement, sinkholes, broken water mains and standing water. Go slowly and test the ground.`);
  if ((by.slide || 0) >= 50) n.push(`Passes ${fmtKm(by.slide)} of mapped landslide ground: watch the slope above and below you, especially after rain. Turn back if you see fresh cracks, tilted trees or moving debris.`);
  if ((by.flood || 0) >= 50) n.push(`Runs ${fmtKm(by.flood)} through a flood zone. If water covers the road or path, turn around.`);
  const v = sev();
  for (const nm of o.used) { const b = DATA.bridges.find(x => x.name === nm); if (!b) continue;
    n.push(b.quake === 'resilient' ? `Assumes ${esc(nm)} is among the first bridges to reopen (built or upgraded for earthquakes)${v === 'major' || v === 'severe' ? '. It still needs inspection and may stay closed for hours or longer' : ''}. Check for closures and visible damage before you cross.`
      : S.overrides[b.id] === 'open' ? `Crosses ${esc(nm)}, which you marked open. Check for closures and visible damage before you cross.`
      : `Crosses ${esc(nm)}, assumed open in a ${SEVERITY[v].label.toLowerCase()} quake. Older bridges can close for inspection after any felt quake; have another option ready.`); }
  for (const c of o.bad) n.push(`Crosses ${esc(c.bridge.name)}, which isn't expected to be usable after a major quake${c.bridge.note ? ' (' + esc(c.bridge.note) + ')' : ' (not seismically upgraded)'}. Confirm it's open before you set out, and have another option ready.`);
  const fw = [...new Set((o.steps || []).flatMap(s => String(s.ref || '').split(';')).map(x => x.trim()).filter(x => /^(I|US|OR|WA|SR)[ -]?\d/.test(x)))];
  if (S.mode !== 'foot' && fw.length) n.push(`Uses ${esc(fw.slice(0, 4).join(', '))}: freeway bridges, overpasses and ramps may be closed for inspection after a major quake. Expect detours.`);
  if (o.kind === 'straight') n.push('No mapped path was found (offline, or every crossing is blocked). This is a compass bearing only. Stay put if travel looks unsafe, and send a check-in.');
  if (S.mode === 'foot' && o.dist > 15000) n.push(`That's a long walk (${fmtKm(o.dist)}). Plan water and rest stops, or check whether someone closer can go.`);
  if (o.kind.startsWith('corridor')) n.push('No street directions (offline or the routing service is down): these are compass headings along the safest line. Follow streets that stay close to it.');
  return n;
}

/* ---------- route cards ---------- */
function onMyWayText(r) {
  const b = r.opts[r.sel], how = { foot: 'walking', bike: 'biking', car: 'driving' }[S.mode];
  return `Path2Safe: I'm on my way to you, about ${fmtMin(b.dur)} ${how} in normal conditions (${fmtKm(b.dist)}), likely longer after the quake. Stay where you are if it's safe. ` + (checkinText() || '');
}
function routeCard(r, ri) {
  const who = r.label || esc(nameOf(r.p)) + ' → ' + esc(r.target.name);
  if (r.fail) return `<div class="route" style="border-color:${r.col}"><b>${who}</b><div class="warn">No safe path found. Every crossing is closed or blocked. Stay put, shelter safely, and send a text check-in.</div></div>`;
  const b = r.opts[r.sel], hzM = b.ex.total, pct = b.ex.len ? Math.round(100 * hzM / b.ex.len) : 0;
  const parts = Object.entries(b.ex.by).filter(([, m]) => m >= 20).sort((x, y) => y[1] - x[1]).map(([k, m]) => `${KIND[k] || k} ${fmtKm(m)}`).join(', ');
  const r0 = r.opts[0], dl = (v, f) => (v >= 0 ? '+' : '−') + f(Math.abs(v));
  const why = o => o === r0 ? (o.bad.length ? 'via ' + o.bad.map(c => c.bridge.name).join(', ') + ' (at risk)' : o.used.length ? 'via ' + o.used.join(', ') : 'best balance of distance and hazards') : [Math.abs(o.dist - r0.dist) > 200 ? dl(o.dist - r0.dist, fmtKm) + ' distance' : '', Math.abs(o.ex.total - r0.ex.total) > 50 ? dl(o.ex.total - r0.ex.total, fmtKm) + ' in hazard areas' : '', o.used.join(',') !== r0.used.join(',') && o.used.length ? 'via ' + o.used.join(', ') : ''].filter(Boolean).join(', ') + (o.tags.includes('Backup route') ? '. Use it if the main route is blocked' : '') + (o.bad.length && o !== r0 && o.dur < r0.dur && !r0.bad.length ? '. Much shorter, but only if that bridge is open' : '') + (o.tags.includes('Compass-only backup') ? '. Headings only, for when street directions fail' : '');
  const choices = r.opts.length > 1 ? `<div class="opts">${r.opts.map((o, oi) => `<button class="opt${o.bad.length ? ' risky' : ''}" data-opt="${ri}:${oi}" aria-pressed="${oi === r.sel}"><b>${o.tags.join(' · ')}</b><span>${fmtKm(o.dist)} · ${fmtMin(o.dur)} · ${fmtKm(o.ex.total)} in hazards</span><span>${esc(why(o))}</span></button>`).join('')}</div>`
    : b.bad.length ? '<div class="warn" style="margin:8px 0"><b>Best available path, not a safe one.</b> Every crossing on this trip is at risk. Check bridge status first, or wait where you are if that\'s safer.</div>'
    : b.kind === 'straight' ? '' : '<p class="meta" style="margin:8px 0">No other route avoids hazards better than this one.</p>';
  const notes = routeSafety(b);
  const tp = r.target.person, sms = tp && r.p === S.me && tp.tel ? `<div class="row" style="margin-top:6px"><a class="btn ghost sm" style="text-decoration:none" href="sms:${encodeURIComponent(tp.tel)}${isIOS ? '&' : '?'}body=${encodeURIComponent(onMyWayText(r))}">Text ${esc(tp.name)} you're coming</a></div>` : '';
  const steps = b.steps.map(s => `<li><span>${esc(s.text)}</span>${s.dist >= 15 ? `<span class="meta"> · ${fmtKm(s.dist)}</span>` : ''}${s.warn && s.warn.length ? `<div class="stepwarn">⚠ ${esc(s.warn.join('; '))}</div>` : ''}</li>`).join('');
  return `<div class="route" style="border-color:${r.col}" data-card="${ri}"><b>${who}</b>${r.label ? '' : ' · ' + (STATUS[r.p.status] || 'OK')}
    <div class="row" style="gap:14px"><span><b>${fmtKm(b.dist)}</b></span><span>about <b>${fmtMin(b.dur)}</b> in normal conditions</span></div>
    <div class="meta">${b.used.length ? 'Crosses ' + esc(b.used.join(', ')) + ' · ' : ''}Through hazard areas: ${fmtKm(hzM)} (${pct}%)${parts ? ': ' + esc(parts) : ''}</div><div class="bar"><i style="width:${pct}%"></i></div>
    ${choices}
    ${notes.length ? `<ul class="notes">${notes.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
    ${!r.label && r.p.status !== 'ok' && r.p.status !== 'none' ? '<div class="warn">' + esc(nameOf(r.p)) + ' is marked ' + STATUS[r.p.status] + '. They may not be able to travel.</div>' : ''}${sms}
    <details class="dirs"${ri === lastPlan.focus ? ' open' : ''}><summary>Turn-by-turn directions (${b.steps.length} steps)</summary><ol>${steps}</ol></details></div>`;
}
let lastPlan = { cards: [], head: '', focus: 0 };
function drawPlan() {
  lyRoutes.clearLayers();
  if (lastPlan.flag) lastPlan.flag.addTo(lyRoutes);
  lastPlan.cards.forEach((r, ri) => {
    if (r.fail) return;
    if (ri === lastPlan.focus) r.opts.forEach((o, oi) => { if (oi !== r.sel) L.polyline(o.line, { color: '#5B6770', weight: 4, opacity: .55, dashArray: '2 7' }).bindTooltip(o.tags.join(' · ') + ' (tap to use)').on('click', () => { r.sel = oi; renderPlanResults(); }).addTo(lyRoutes); });
    const o = r.opts[r.sel];
    L.polyline(o.line, { color: '#fff', weight: 8, opacity: .9 }).addTo(lyRoutes);
    L.polyline(o.line, { color: r.col, weight: ri === lastPlan.focus ? 6 : 4, opacity: .95, dashArray: o.kind.startsWith('corridor') ? '8 8' : null }).bindTooltip(r.label || nameOf(r.p)).addTo(lyRoutes);
  });
}
function renderPlanResults() {
  const n = lastPlan.cards.length;
  $('#routes').innerHTML = `<div class="planhead"><b>${esc(lastPlan.title)}</b><button class="linkbtn" data-editplan>Change plan</button></div>` + `<div class="notify"><b>Scenario: ${SEVERITY[sev()].label} quake.</b> ${esc(SEVERITY[sev()].desc)} These are planning assumptions from hazard maps and bridge status, not a forecast. Real closures depend on inspections, so follow official alerts.</div>` + lastPlan.head + generalSafety() + lastPlan.cards.map(routeCard).join('') + (lastPlan.foot || '')
    + `<p class="src">Expect debris, downed lines and closures the data can't show. Walking is usually the most reliable way to move after a big quake.${navigator.onLine ? '' : ' Offline: showing compass-heading lines only.'}</p><div class="hr"></div>`;
  drawPlan();
}

async function planRoutes() {
  const pl = plan(), g = pl.goal, en = env();
  let target;
  if (g === 'meet') { if (!S.meet) return toast('Choose a meeting point first.'); target = { name: S.meet.name, lat: S.meet.lat, lng: S.meet.lng }; }
  else if (g === 'person') { const m = S.members[pl.person]; if (!m || m.lat == null) return toast('Choose someone who has shared a location.'); target = { name: m.name, lat: m.lat, lng: m.lng, person: m }; }
  else { const p = S.places.find(x => x.id === pl.place); if (!p) return toast('Save the school or release site first.'); target = { name: p.name, lat: p.lat, lng: p.lng }; }
  const travelers = whoIds().map(byId).filter(Boolean);
  if (!travelers.length) return toast(located().length ? "Choose who's going." : 'No one has a location yet. Share yours on the Family screen.');
  $('#routes').innerHTML = '<p class="hint">Planning routes and alternatives…</p>'; lyRoutes.clearLayers();
  await new Promise(r => setTimeout(r, 30));
  const results = await routeLeg(target, travelers, en);
  let head = '', leg2 = [];
  const kids = pl.kids.map(id => S.members[id]).filter(Boolean).map(m => m.name);
  if (g === 'person') {
    const m = target.person;
    head = m.status === 'injured' ? `<div class="warn" style="margin-top:8px"><b>${esc(m.name)} is marked Injured.</b> Call 911 if you can get through and stay with them if it's safe. Don't enter damaged buildings or cross downed lines to reach them.</div>`
      : m.status === 'help' ? `<div class="warn" style="margin-top:8px"><b>${esc(m.name)} needs help.</b> Go only if the route is safe for you; otherwise send someone closer.</div>` : '';
    const ok = results.filter(r => r.opts).sort((a, b) => a.opts[0].dur - b.opts[0].dur);
    if (ok.length > 1) head += `<p class="meta" style="margin-top:8px">Closest: <b>${esc(nameOf(ok[0].p))}</b>, about ${fmtMin(ok[0].opts[0].dur)}.</p>`;
  }
  if (g === 'pickup') {
    head = `<p class="meta" style="margin-top:8px">Picking up ${kids.length ? '<b>' + esc(kids.join(', ')) + '</b>' : 'your children'} at <b>${esc(target.name)}</b>. Bring photo ID; the school may send you to its release site instead.</p>`;
    const th = thenTarget();
    if (th && E.hav([th.lat, th.lng], [target.lat, target.lng]) > 80) leg2 = await routeLeg(th, [{ id: 'leg2', lat: target.lat, lng: target.lng, status: 'ok', legCol: '#5B6770' }], en, `Then ${esc(target.name)} → ${esc(th.name)}${kids.length ? ' with ' + esc(kids.join(', ')) : ''}`);
  }
  // Messages to the families involved and to out-of-area contacts
  const mine = results.find(r => r.p === S.me) || results[0], eta = mine && mine.opts ? fmtMin(mine.opts[0].dur) : '', meN = S.me.name || 'Your family member';
  const recips = g => Object.values(S.members).filter(m => groupOf(m).id === g.id && !pl.kids.includes(m.id) && (m.tel || m.email) && !(target.person && m.id === target.person.id));
  if (g === 'pickup' && kids.length) {
    const th = thenTarget(), gs = [...new Set(pl.kids.map(id => S.members[id]).filter(Boolean).map(groupOf))];
    for (const grp of gs) {
      const ks = pl.kids.map(id => S.members[id]).filter(m => m && groupOf(m) === grp).map(m => m.name).join(' and '), rc = recips(grp);
      const onWay = `Path2Safe: ${meN} here. I'm heading to ${target.name} to pick up ${ks}${th ? ' and bring them to ' + th.name : ''}. About ${eta} in normal conditions, likely longer. I'll text when I have them.`;
      const have = `Path2Safe: ${meN} here. I have ${ks} and we're OK.${th ? ' Taking them to ' + th.name + '.' : ''} ${checkinText() || ''}`;
      head += `<div class="notify"><b>Let ${esc(grp.name)} know</b>${rc.length ? '' : '<p class="hint" style="margin:4px 0">No numbers saved for this group yet.</p>'}<div class="meta" style="margin-top:6px">When you leave:</div>${notifyButtons(rc, onWay, 'Picking up ' + ks)}<div class="meta" style="margin-top:8px">When you have them:</div>${notifyButtons(rc, have, ks + ' picked up')}</div>`;
    }
  }
  if (g === 'person') {
    const grp = groupOf(target.person), rc = recips(grp);
    if (rc.length) head += `<div class="notify"><b>Let ${esc(grp.name)} know</b>${notifyButtons(rc, `Path2Safe: ${meN} is heading to ${target.person.name} (marked ${STATUS[target.person.status] || 'OK'}). About ${eta} in normal conditions. I'll update you.`, 'Going to ' + target.person.name)}</div>`;
  }
  const outs = Object.values(S.members).filter(isNotify);
  const foot = outs.length ? `<div class="notify"><b>Update out-of-area contacts</b>${notifyButtons(outs, statusSummary(), 'Path2Safe update')}</div>` : '';
  const cards = [...results, ...leg2], meIdx = cards.findIndex(r => r.p === S.me);
  lastPlan = { cards, head, foot, focus: meIdx >= 0 ? meIdx : 0, title: g === 'person' ? 'Routes to ' + target.name : g === 'pickup' ? 'Pickup at ' + target.name : 'Routes to ' + target.name,
    flag: g === 'pickup' ? L.marker([target.lat, target.lng], { icon: L.divIcon({ className: '', html: `<div class="flag">Pick up: ${esc(target.name)}</div>`, iconSize: null, iconAnchor: [0, 12] }), zIndexOffset: 2000 }) : null };
  renderPlanResults();
  const all = cards.filter(r => r.opts).flatMap(r => r.opts.flatMap(o => o.line)); if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [30, 30] });
  $('#t-reunite').scrollTop = 0; $('#sheet').scrollTop = 0;
}
function startPlan(goal, set) {
  lastPlan = { cards: [], head: '', focus: 0 }; lyRoutes.clearLayers();
  const pl = plan(); pl.goal = goal; pl.who = null; Object.assign(pl, set || {});
  if (goal === 'pickup' && !(set && set.place)) { const cur = S.places.find(p => p.id === pl.place), sch = S.places.find(p => SCHOOLISH.test(p.name)); if (sch && !(cur && SCHOOLISH.test(cur.name))) pl.place = sch.id; } save(); goTab('reunite'); renderPlan(); $('#routes').innerHTML = ''; }

async function fairestPoint() {
  const people = located();
  if (people.length < 2) return toast('Need at least two people with locations.');
  const pts = people.map(p => [p.lat, p.lng]);
  const bounds = E.padBounds(pts, 3000), en = env(), G = E.buildGrid(bounds, en, 260);
  const cands = [...S.places.map(p => ({ name: p.name, lat: p.lat, lng: p.lng })), ...DATA.beecn.map(([n, la, ln]) => ({ name: n, lat: la, lng: ln }))]
    .filter(c => c.lat > bounds.s && c.lat < bounds.n && c.lng > bounds.w && c.lng < bounds.e && !((E.hazardAt(H, c.lat, c.lng) || {}).cost >= 8));
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
  $('#places').innerHTML = S.places.length ? S.places.map(p => `<div class="member" style="grid-template-columns:1fr auto"><div><b>${esc(p.name)}</b><div class="meta">${esc(p.addr || p.lat.toFixed(5) + ', ' + p.lng.toFixed(5))}${hzWarn(p)}</div></div><div class="row">${SCHOOLISH.test(p.name) ? `<button class="btn ghost sm" data-pickup="${p.id}" aria-label="Plan a pickup at ${esc(p.name)}">Pick up</button>` : ''}<button class="btn ghost sm" data-delpl="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button></div></div>`).join('') : '<p class="hint">Save home, school, work and your family meeting spots.</p>';
}

/* ---------- name prompt (in-page, no browser dialogs) ---------- */
function askName(label, cb) {
  const box = document.createElement('div'); box.className = 'card'; box.innerHTML = `<label class="f">${esc(label)}</label><div class="row"><input type="text" class="grow"><button class="btn sm">Save</button></div>`;
  const pane = $('.pane.on'); pane.prepend(box); const inp = box.querySelector('input'); inp.focus(); $('#sheet').classList.remove('min');
  const done = () => { const v = inp.value.trim(); box.remove(); if (v) cb(v.slice(0, 40)); };
  box.querySelector('button').onclick = done; inp.onkeydown = e => { if (e.key === 'Enter') done(); };
}

/* ---------- find a location by address (or tap the map) ---------- */
// OpenStreetMap Nominatim (search on request only, per its usage policy), Photon as fallback.
const VIEWBOX = '-123.25,45.80,-122.10,45.15';
const AREA = { w: -123.25, s: 45.15, e: -122.10, n: 45.80 };
const inArea = (la, ln) => la > AREA.s && la < AREA.n && ln > AREA.w && ln < AREA.e;
const TYPE = { school: 'School', kindergarten: 'Preschool', childcare: 'Child care', college: 'College', university: 'University', hospital: 'Hospital', clinic: 'Clinic', doctors: 'Clinic', pharmacy: 'Pharmacy', supermarket: 'Grocery', library: 'Library', place_of_worship: 'Place of worship', community_centre: 'Community centre', fire_station: 'Fire station', police: 'Police', park: 'Park', sports_centre: 'Sports centre', swimming_pool: 'Pool', stadium: 'Stadium', townhall: 'City hall', fuel: 'Gas station', restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Restaurant', bank: 'Bank', hotel: 'Hotel', mall: 'Shopping centre', department_store: 'Store', hardware: 'Hardware store', doityourself: 'Hardware store', office: 'Office', station: 'Station', house: 'Address', residential: 'Address', building: 'Building', apartments: 'Apartments' };
const tidy = s => String(s || '').replace(/\bNortheast\b/g, 'NE').replace(/\bNorthwest\b/g, 'NW').replace(/\bSoutheast\b/g, 'SE').replace(/\bSouthwest\b/g, 'SW').replace(/\bNorth\b(?= \w)/g, 'N').replace(/\bAvenue\b/g, 'Ave').replace(/\bStreet\b/g, 'St').replace(/\bBoulevard\b/g, 'Blvd').replace(/\bDrive\b/g, 'Dr').replace(/\bRoad\b/g, 'Rd').replace(/\bHighway\b/g, 'Hwy');
const ABBR = { saint: 'st', street: 'st', avenue: 'ave', boulevard: 'blvd', drive: 'dr', road: 'rd', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw', highway: 'hwy', elementary: 'elem', centre: 'center', mount: 'mt' };
const toks = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w && !['the', 'of', 'and', 'at', 'in'].includes(w)).map(w => ABBR[w] || w);
async function getJson(u, ms) { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms); try { return await (await fetch(u, { signal: ctl.signal })).json(); } finally { clearTimeout(to); } }
// Finds street addresses and named places (schools, businesses, parks…) inside the three-county area, nearest first.
async function geocode(q, near) {
  const ref = near || (S.me.lat != null ? [S.me.lat, S.me.lng] : [map.getCenter().lat, map.getCenter().lng]);
  const nom = async bounded => {
    const j = await getJson('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'jsonv2', limit: 10, countrycodes: 'us', viewbox: VIEWBOX, bounded: bounded ? 1 : 0, addressdetails: 1 }), 10000);
    return (Array.isArray(j) ? j : []).map(x => { const a = x.address || {};
      const street = tidy([a.house_number, a.road].filter(Boolean).join(' ')), city = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || '';
      const name = x.name && x.name !== a.house_number ? x.name : '';
      return { name, street, city, type: TYPE[x.type] || '', lat: +x.lat, lng: +x.lon }; });
  };
  const pho = async () => {
    const j = await getJson('https://photon.komoot.io/api/?' + new URLSearchParams({ q, limit: 10, lat: ref[0], lon: ref[1], bbox: [AREA.w, AREA.s, AREA.e, AREA.n].join(',') }), 10000);
    return (j.features || []).map(f => { const p = f.properties, [ln, la] = f.geometry.coordinates;
      return { name: p.name || '', street: tidy([p.housenumber, p.street].filter(Boolean).join(' ')), city: p.city || p.town || p.district || p.county || '', type: TYPE[p.osm_value] || '', lat: la, lng: ln }; });
  };
  const [a, b] = await Promise.allSettled([nom(true), pho()]);
  let hits = [...(a.value || []), ...(b.value || [])];
  if (!hits.length && a.status === 'fulfilled') { try { hits = await nom(false); } catch (e) { } }   // nothing nearby: look wider
  if (!hits.length && a.status === 'rejected' && b.status === 'rejected') return null;
  const out = [], words = toks(q);
  for (const h of hits) {
    if (!h.name && !h.street) continue;
    h.d = E.hav(ref, [h.lat, h.lng]); h.far = !inArea(h.lat, h.lng);
    const hay = new Set(toks([h.name, h.street, h.city, h.type].join(' ')));
    h.match = (words.length ? words.filter(w => hay.has(w)).length / words.length : 0) + (toks(h.name).join(' ') === words.join(' ') ? .5 : 0);
    const roadOnly = !h.name || h.name === h.street;
    const dup = out.find(o => (o.name || o.street).toLowerCase() === (h.name || h.street).toLowerCase() && E.hav([o.lat, o.lng], [h.lat, h.lng]) < (roadOnly ? 1500 : 120));
    if (dup) { dup.type = dup.type || h.type; dup.street = dup.street || h.street; dup.city = dup.city || h.city; continue; }
    out.push(h);
  }
  out.sort((x, y) => (x.far - y.far) || (Math.round(y.match * 4) - Math.round(x.match * 4)) || ((x.d - (x.type && x.street ? 1500 : 0)) - (y.d - (y.type && y.street ? 1500 : 0))));
  return out.slice(0, 8).map(h => ({ ...h, short: h.name || h.street || h.city, label: [h.name, h.street, h.city].filter(Boolean).join(', ') }));
}
// opts: {title, nameLabel (omit to skip the name), mapPrompt, done(name, lat, lng, label)}
function findPlace(opts) {
  $$('.findplace').forEach(b => b.remove());
  const box = document.createElement('div'); box.className = 'card findplace';
  box.innerHTML = `<div class="row" style="justify-content:space-between"><b>${esc(opts.title)}</b><button class="linkbtn" data-x aria-label="Close">Cancel</button></div>
    ${opts.nameLabel ? `<label class="f" for="fpName">${esc(opts.nameLabel)}</label><input type="text" id="fpName" maxlength="40">` : ''}
    <label class="f" for="fpAddr">Address or place</label>
    <form class="row" data-f><input type="text" id="fpAddr" class="grow" autocomplete="off" enterkeyhint="search" placeholder="Address, school, business or place"><button class="btn sm" type="submit">Search</button></form>
    <div data-res></div>
    <button class="linkbtn" data-map>Or tap the spot on the map</button>`;
  const pane = $('.pane.on'); pane.prepend(box); pane.scrollTop = 0; $('#sheet').classList.remove('min');
  const nameIn = box.querySelector('#fpName'), addrIn = box.querySelector('#fpAddr'), res = box.querySelector('[data-res]');
  (nameIn || addrIn).focus();
  const finish = (lat, lng, label, short) => {
    const name = nameIn ? (nameIn.value.trim() || short || 'Place').slice(0, 40) : '';
    if (nameIn && !nameIn.value.trim() && !short) { nameIn.focus(); return; }
    box.remove(); opts.done(name, lat, lng, label); map.setView([lat, lng], Math.max(map.getZoom(), 15));
  };
  box.querySelector('[data-x]').onclick = () => box.remove();
  box.querySelector('[data-map]').onclick = () => {
    if (nameIn && !nameIn.value.trim()) { nameIn.focus(); nameIn.placeholder = 'Name it first'; return; }
    pick(opts.mapPrompt || 'Tap the spot', (la, ln) => finish(la, ln, 'set on map', ''));
  };
  box.querySelector('[data-f]').onsubmit = async e => {
    e.preventDefault(); const q = addrIn.value.trim(); if (q.length < 3) return;
    if (!navigator.onLine) { res.innerHTML = '<p class="hint">Address search needs a connection. Tap the map instead.</p>'; return; }
    res.innerHTML = '<p class="hint">Searching…</p>';
    const hits = await geocode(q);
    if (!hits) { res.innerHTML = '<p class="hint">Search isn\'t responding. Try again, or tap the map.</p>'; return; }
    if (!hits.length) { res.innerHTML = '<p class="hint">No match. Try a fuller name, add the city, or tap the map.</p>'; return; }
    res.innerHTML = hits.map((h, i) => `<button class="hit" data-i="${i}"><b>${esc(h.name || h.street)}</b><span class="meta">${esc([h.type, h.name ? h.street : '', h.city].filter(Boolean).join(' · '))}${h.far ? ' · outside the map area' : ' · ' + fmtKm(h.d)}</span></button>`).join('');
    res.onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; const h = hits[+b.dataset.i]; finish(h.lat, h.lng, h.label, h.short); };
  };
}

/* ---------- address book ---------- */
const hasPicker = 'contacts' in navigator && 'ContactsManager' in window;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const normTel = t => String(t || '').replace(/[^\d+]/g, '').replace(/^1(?=\d{10}$)/, '');
function findByName(n) { const k = String(n || '').trim().toLowerCase(); return k ? Object.values(S.members).find(m => (m.name || '').trim().toLowerCase() === k) : null; }
function addContacts(list) {
  let n = 0;
  for (const c of list) {
    const name = String(c.name || '').trim().slice(0, 40), tel = String(c.tel || '').trim().slice(0, 30), email = String(c.email || '').trim().slice(0, 80);
    if (!name && !tel) continue;
    const ex = Object.values(S.members).find(m => (tel && m.tel && normTel(m.tel) === normTel(tel)) || (name && (m.name || '').toLowerCase() === name.toLowerCase()));
    if (ex) { ex.tel = ex.tel || tel; ex.email = ex.email || email; continue; }
    const id = 'c-' + uid(); S.members[id] = { id, name: name || tel, tel, email, group: $('#addGroup').value || 'home', status: 'none', src: 'from contacts' }; n++;
  }
  save(); renderMembers();
  toast(n ? `Added ${n} ${n === 1 ? 'person' : 'people'}. Tap Invite so they can share where they are.` : 'Already on your list.', 4500);
}
function parseVcf(text) {
  const out = [], body = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const unesc = v => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
  for (const card of body.split(/BEGIN:VCARD/i).slice(1)) {
    const get = re => { const m = card.match(re); return m ? unesc(m[1]) : ''; };
    let name = get(/^(?:item\d+\.)?FN[^:\n]*:(.*)$/im);
    if (!name) { const nn = get(/^N(?:;[^:\n]*)?:(.*)$/im).split(';'); name = [nn[1], nn[0]].filter(Boolean).join(' '); }
    out.push({ name, tel: get(/^(?:item\d+\.)?TEL[^:\n]*:(.*)$/im), email: get(/^(?:item\d+\.)?EMAIL[^:\n]*:(.*)$/im) });
  }
  return out;
}
function inviteText() {
  const url = location.origin + location.pathname;
  if (S.fb.url && S.fb.code) return `Join our family on Path2Safe so we can find each other after an earthquake. Open ${url}, tap Setup, and enter database ${S.fb.url} and family code ${S.fb.code}.`;
  return `After a big quake, please send me a Path2Safe check-in. Open ${url}, set your spot, then copy the text check-in and send it to me.`;
}
async function invite(m) {
  const t = inviteText();
  if (m.tel) { location.href = `sms:${normTel(m.tel)}${isIOS ? '&' : '?'}body=${encodeURIComponent(t)}`; return; }
  if (m.email) { location.href = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Path2Safe family plan')}&body=${encodeURIComponent(t)}`; return; }
  try { await navigator.clipboard.writeText(t); toast('No phone saved. Invite copied: paste it into a message.'); } catch (e) { toast(t, 8000); }
}
if (!hasPicker) {
  $('#pickContacts').hidden = true;
  $('#vcfLabel').classList.remove('ghost');
  $('#contactsHint').textContent = isIOS
    ? 'On iPhone: open Contacts, choose a person, tap Share Contact, then Save to Files. Pick that file here. Contacts stay on this phone.'
    : 'Export contact cards (.vcf) from your address book and pick them here. Contacts stay on this phone.';
}
$('#pickContacts').onclick = async () => {
  try {
    const list = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
    addContacts(list.map(c => ({ name: (c.name || [])[0], tel: (c.tel || [])[0], email: (c.email || [])[0] })));
  } catch (e) { toast('Could not open contacts: ' + e.message); }
};
$('#vcfInput').onchange = async e => {
  const out = []; for (const f of e.target.files) { try { out.push(...parseVcf(await f.text())); } catch (err) { } }
  e.target.value = ''; out.length ? addContacts(out) : toast('No contacts found in that file.');
};

/* ---------- getting started: six steps, shown until done ---------- */
const STEPS = [
  { k: 'name', t: 'Add your name', done: () => !!(S.me.name || '').trim(), go: () => $('#myName').focus() },
  { k: 'spot', t: 'Share or set your location', done: () => S.me.lat != null, go: () => $('#pickMe').click() },
  { k: 'family', t: 'Add your family', done: () => Object.keys(S.members).length > 0, go: () => (hasPicker ? $('#pickContacts') : $('#addMember')).click() },
  { k: 'out', t: 'Add an out-of-area contact', done: () => Object.values(S.members).some(isNotify), go: () => { $('#addGroup').value = 'out'; addByPhone(); } },
  { k: 'places', t: 'Save home, school and work', done: () => S.places.length > 0, go: () => { goTab('setup'); $('#addPlace').click(); } },
  { k: 'meet', t: 'Choose a meeting point', done: () => !!S.meet, go: () => { goTab('reunite'); $('#pickMeet').click(); } }
];
function renderSetup() {
  const box = $('#setupCard'); if (!box) return;
  const n = STEPS.filter(x => x.done()).length;
  if (n === STEPS.length || S.setupHidden) { box.innerHTML = ''; return; }
  const next = STEPS.find(x => !x.done());
  box.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><span class="meta">Setup · ${n} of ${STEPS.length} done</span><button class="linkbtn" data-step-hide style="min-height:0;padding:0;font-size:13px">Hide</button></div>
    <div class="progressbar"><i style="width:${n / STEPS.length * 100}%"></i></div>
    <div class="row" style="justify-content:space-between;margin-top:10px"><b>${next.t}</b><button class="btn sm" data-step="${next.k}">${next.k === 'name' ? 'Add' : 'Start'}</button></div></div>`;
}
$('#setupCard').onclick = e => {
  const b = e.target.closest('[data-step]'); if (b) STEPS.find(x => x.k === b.dataset.step).go();
  if (e.target.closest('[data-step-hide]')) { S.setupHidden = true; save(); renderSetup(); }
};
function goTab(t) {
  $$('nav.tabs button').forEach(x => x.setAttribute('aria-selected', x.dataset.t === t));
  $$('.pane').forEach(p => p.classList.toggle('on', p.id === 't-' + t));
  $('#sheet').classList.remove('min'); if (t === 'setup') renderPlaces(); if (t === 'reunite') { renderMeetSel(); renderPlan(); renderSev(); }
}

/* ---------- events ---------- */
$$('nav.tabs button').forEach(b => b.onclick = () => {
  // on a phone, tapping the open section again folds the panel down to show the map
  if (b.getAttribute('aria-selected') === 'true' && innerWidth <= 760) { $('#sheet').classList.toggle('min'); return; }
  goTab(b.dataset.t);
});
$('#grab').onclick = () => $('#sheet').classList.toggle('min');
$('#myName').oninput = e => { S.me.name = e.target.value.slice(0, 40); save(); renderCheckin(); drawPeople(); renderSetup(); };
$$('#mySt button').forEach(b => b.onclick = () => { S.me.status = b.dataset.s; S.me.ts = S.me.ts || Date.now(); save(); renderMembers(); syncPush(true); });
$('#gpsBtn').onclick = startGps;
$('#pickMe').onclick = () => findPlace({ title: 'Where are you?', mapPrompt: 'Tap where you are', done: (n, la, ln, label) => { Object.assign(S.me, { lat: la, lng: ln, ts: Date.now(), src: label === 'set on map' ? 'set on map' : 'by address' }); save(); renderMembers(); syncPush(true); } });
$('#addMember').onclick = () => findPlace({ title: 'Add someone at a place', nameLabel: 'Their name', mapPrompt: 'Tap where they are', done: (n, la, ln) => {
  const ex = findByName(n), id = ex ? ex.id : uid(); S.members[id] = { ...(ex || {}), id, name: n, group: ex ? ex.group : ($('#addGroup').value || 'home'), status: (ex && ex.status !== 'none') ? ex.status : 'ok', lat: la, lng: ln, ts: Date.now(), src: 'added by hand' }; save(); renderMembers(); } });
$('#demoBtn').onclick = loadDemo;
$('#newGroup').onclick = newGroup;
$('#addPhone').onclick = addByPhone;
$('#members').onclick = e => {
  const z = e.target.closest('[data-zoom]'), d = e.target.closest('[data-del]');
  const iv = e.target.closest('[data-invite]');
  if (iv) invite(S.members[iv.dataset.invite]);
  const gt = e.target.closest('[data-goto]'); if (gt) startPlan('person', { person: gt.dataset.goto });
  const ed = e.target.closest('[data-edit]'); if (ed) editPerson(ed.dataset.edit);
  const ge = e.target.closest('[data-gedit]'); if (ge) editGroup(ge.dataset.gedit);
  if (z) { const m = S.members[z.dataset.zoom]; if (m.lat == null) return; map.setView([m.lat, m.lng], 15); if (innerWidth <= 760) $('#sheet').classList.add('min'); }
};
$('#meetSel').onchange = e => { const v = e.target.value; if (!v || v === 'cur') return; const o = meetOptions().find(x => x.k === v); if (o) setMeet(o); };
$('#pickMeet').onclick = () => findPlace({ title: 'Choose a meeting point', nameLabel: 'Name (optional)', mapPrompt: 'Tap the meeting point', done: (n, la, ln) => setMeet({ name: n, lat: la, lng: ln }) });
$('#fairBtn').onclick = fairestPoint;
$$('#modeSeg button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.m === S.mode); b.onclick = () => { S.mode = b.dataset.m; save(); $$('#modeSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawBridges(); }; });
$('#planBtn').onclick = planRoutes;
$$('#sevSeg button').forEach(b => b.onclick = () => { S.severity = b.dataset.v; save(); renderSev(); drawBridges(); if (lastPlan.cards.length) planRoutes(); });
$('#routes').onclick = e => {
  const o = e.target.closest('[data-opt]'); if (o) { const [ri, oi] = o.dataset.opt.split(':').map(Number); lastPlan.cards[ri].sel = oi; lastPlan.focus = ri; renderPlanResults(); return; }
  if (e.target.closest('[data-editplan]')) { $('#goalSeg').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const c = e.target.closest('[data-card]'); if (c && !e.target.closest('a,button,summary,details') && +c.dataset.card !== lastPlan.focus) { lastPlan.focus = +c.dataset.card; drawPlan(); }
};
$$('#goalSeg button').forEach(b => b.onclick = () => startPlan(b.dataset.g));
$('#personSel').onchange = e => { plan().person = e.target.value; plan().who = null; save(); renderPlan(); };
$('#pickSel').onchange = e => { plan().place = e.target.value; save(); renderPlan(); };
$('#thenSel').onchange = e => { plan().then = e.target.value; save(); };
$('#kidChips').onclick = e => { const c = e.target.closest('[data-kid]'); if (!c) return; const k = plan().kids, id = c.dataset.kid; k.includes(id) ? k.splice(k.indexOf(id), 1) : k.push(id); save(); renderPlan(); };
$('#whoChips').onclick = e => { const c = e.target.closest('[data-who]'); if (!c || c.disabled) return; const w = whoIds(), id = c.dataset.who; plan().who = w.includes(id) ? w.filter(x => x !== id) : [...w, id]; save(); renderPlan(); };
$('#pickSchool').onclick = () => findPlace({ title: 'School or release site', nameLabel: 'Name (for example, Lincoln High School)', mapPrompt: 'Tap the school', done: (n, la, ln, label) => { const id = uid(); S.places.push({ id, name: n, lat: la, lng: ln, addr: label === 'set on map' ? '' : label }); plan().place = id; save(); renderPlaces(); renderMembers(); } });
$('#outBtns').addEventListener('click', e => { if (e.target.closest('[data-goout]')) { goTab('family'); $('#addGroup').value = 'out'; addByPhone(); } });
$('#ciCopy').onclick = async () => { const t = checkinText(); if (!t) return toast('Set your location first.'); try { await navigator.clipboard.writeText(t); toast('Copied. Paste it into a text message.'); } catch (e) { toast('Copy blocked: press and hold the message to copy.'); } };
$('#ciAdd').onclick = () => {
  const r = parseCheckins($('#ciPaste').value);
  if (!r.people.length) { $('#ciMsg').textContent = 'No Path2Safe check-in found in that text.'; return; }
  r.people = r.people.filter(p => !(S.me.lat != null && E.hav([p.lat, p.lng], [S.me.lat, S.me.lng]) < 5 && p.name === (S.me.name || 'Me')));
  if (!r.people.length) { $('#ciMsg').textContent = 'That check-in is your own.'; return; }
  r.people.forEach(p => {
    const ex = findByName(p.name), id = ex ? ex.id : 'sms-' + p.name.toLowerCase().replace(/\W+/g, '-');
    S.members[id] = { ...(ex || {}), id, ...p, ts: Date.now(), src: 'text check-in' };
  });
  if (r.meet && !S.meet) S.meet = r.meet;
  save(); renderMembers(); $('#ciPaste').value = ''; $('#ciMsg').textContent = 'Added ' + r.people.map(p => p.name).join(', ') + '.';
};
$('#hzLoad').onclick = () => loadHazards(true);
$('#layerList').onchange = e => {
  const t = e.target, id = t.dataset.show || t.dataset.use; if (!id) return;
  const l = LAYERS.find(x => x.id === id), st = S.layers[id];
  if (t.dataset.show) { st.show = t.checked; if (l.type === 'image') drawWui(); else st.show ? map.addLayer(LD[id].group) : map.removeLayer(LD[id].group); }
  else { st.use = t.checked; rebuildIndex(); renderMembers(); toast(t.checked ? `Routes now account for ${l.name.toLowerCase()}.` : `Routes now ignore ${l.name.toLowerCase()}.`); }
  save();
};
$('#lyBr').onchange = e => e.target.checked ? map.addLayer(lyBr) : map.removeLayer(lyBr);
$('#lyBe').onchange = e => e.target.checked ? map.addLayer(lyBe) : map.removeLayer(lyBe);
$('#bridgeList').onchange = e => { const s = e.target.closest('[data-br]'); if (!s) return; if (s.value) S.overrides[s.dataset.br] = s.value; else delete S.overrides[s.dataset.br]; save(); drawBridges(); };
$('#addPlace').onclick = () => findPlace({ title: 'Save a place', nameLabel: 'Name (Home, School, Work…)', mapPrompt: 'Tap the place', done: (n, la, ln, label) => { S.places.push({ id: uid(), name: n, lat: la, lng: ln, addr: label === 'set on map' ? '' : label }); save(); renderPlaces(); renderMembers(); } });
$('#places').onclick = e => { const pu = e.target.closest('[data-pickup]'); if (pu) return startPlan('pickup', { place: pu.dataset.pickup }); const d = e.target.closest('[data-delpl]'); if (d) { S.places = S.places.filter(p => p.id !== d.dataset.delpl); save(); renderPlaces(); renderMembers(); } };
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
netPill(); setGpsPill(); drawBridges(); drawBeecn(); renderMembers(); renderPlaces(); renderLayerList(); drawWui(); loadHazards(false); startSync(); renderReg(); sendReg(); renderSev();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
window.P2S_APP = { S, sendReg, regForm, geocode, plan, startPlan, planRoutes, fairestPoint, loadDemo, parseCheckins, useHazards }; // for testing
}
