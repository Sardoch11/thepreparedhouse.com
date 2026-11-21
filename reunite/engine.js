/* Path2Safe Reunite: routing engine. Pure functions, no DOM; runs in the browser or Node (for tests). */
(function (root) {
  const R = 6371000, D2R = Math.PI / 180;
  const COST = { 5: 30, 4: 8 };        // travel penalty multipliers inside very high / high liquefaction
  const PREFER = 0.6;                  // travel cost multiplier on emergency transportation and lifeline routes
  const BRIDGE_SNAP_M = 450;           // river crossing within this distance of a bridge midpoint counts as that bridge

  function hav(a, b) { // a,b = [lat,lng]
    const dLat = (b[0] - a[0]) * D2R, dLng = (b[1] - a[1]) * D2R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * D2R) * Math.cos(b[0] * D2R) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /* ---------- hazard polygons + spatial index ---------- */
  // polys: [{cls, rings:[[[lng,lat],...], ...holes], bb:[w,s,e,n]}]
  // opts: {kind, cost(props) -> multiplier}; default = liquefaction classes 4/5
  function fromGeoJSON(fc, clsField, opts) {
    const polys = [];
    for (const f of fc.features || []) {
      const g = f.geometry; if (!g) continue;
      const cls = +(f.properties && f.properties[clsField]) || 0;
      const kind = opts && opts.kind ? opts.kind : 'liq' + cls;
      const cost = opts && opts.cost ? opts.cost(f.properties || {}) : (COST[cls] || 1);
      if (!(cost > 1)) continue;
      const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const rings of parts) {
        if (!rings[0] || rings[0].length < 4) continue;
        let w = 180, s = 90, e = -180, n = -90;
        for (const [x, y] of rings[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
        polys.push({ cls, kind, cost, rings, bb: [w, s, e, n] });
      }
    }
    return polys;
  }

  const BK = 0.01;
  function buildIndex(polys) {
    const idx = new Map();
    polys.forEach((p, i) => {
      for (let x = Math.floor(p.bb[0] / BK); x <= Math.floor(p.bb[2] / BK); x++)
        for (let y = Math.floor(p.bb[1] / BK); y <= Math.floor(p.bb[3] / BK); y++) {
          const k = x + ',' + y; let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(i);
        }
    });
    return { polys, idx };
  }

  function inRing(r, x, y) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function inPoly(p, x, y) {
    if (x < p.bb[0] || x > p.bb[2] || y < p.bb[1] || y > p.bb[3]) return false;
    if (!inRing(p.rings[0], x, y)) return false;
    for (let h = 1; h < p.rings.length; h++) if (inRing(p.rings[h], x, y)) return false;
    return true;
  }
  // the costliest hazard polygon at a point, or null
  function hazardAt(H, lat, lng) {
    if (!H) return null;
    const a = H.idx.get(Math.floor(lng / BK) + ',' + Math.floor(lat / BK)); if (!a) return null;
    let best = null; for (const i of a) { const p = H.polys[i]; if ((!best || p.cost > best.cost) && inPoly(p, lng, lat)) best = p; }
    return best;
  }

  /* ---------- cost grid ---------- */
  function bridgeOpen(b, mode, overrides) {
    if (!b.modes[mode]) return false;
    const o = overrides && overrides[b.id];
    if (o === 'open') return true; if (o === 'closed') return false;
    return b.quake === 'resilient';
  }

  // bounds {s,w,n,e}; env {H, rivers, bridges, overrides, mode}
  function buildGrid(bounds, env, maxCells) {
    maxCells = maxCells || 300;
    const b = bounds, lat0 = (b.s + b.n) / 2, kx = 111320 * Math.cos(lat0 * D2R), ky = 110540;
    const wM = (b.e - b.w) * kx, hM = (b.n - b.s) * ky;
    const cell = Math.max(35, Math.max(wM, hM) / maxCells);
    const cols = Math.ceil(wM / cell) + 1, rows = Math.ceil(hM / cell) + 1, N = cols * rows;
    const hz = new Float32Array(N).fill(1), water = new Uint8Array(N), pref = new Uint8Array(N), cost = new Float32Array(N);
    const toLL = (c, r) => [b.s + r * cell / ky, b.w + c * cell / kx];
    const toCR = (lat, lng) => [Math.round((lng - b.w) * kx / cell), Math.round((lat - b.s) * ky / cell)];
    const cl = (v, m) => v < 0 ? 0 : v >= m ? m - 1 : v;

    if (env.H) for (const p of env.H.polys) {
      if (p.bb[2] < b.w || p.bb[0] > b.e || p.bb[3] < b.s || p.bb[1] > b.n) continue;
      const [c0, r0] = toCR(p.bb[1], p.bb[0]), [c1, r1] = toCR(p.bb[3], p.bb[2]);
      for (let r = cl(r0, rows); r <= cl(r1, rows); r++) for (let c = cl(c0, cols); c <= cl(c1, cols); c++) {
        const i = r * cols + c; if (hz[i] >= p.cost) continue;
        const ll = toLL(c, r); if (inPoly(p, ll[1], ll[0])) hz[i] = p.cost;
      }
    }
    // rivers: 3-cell-wide impassable band
    for (const rv of env.rivers || []) for (let k = 0; k < rv.pts.length - 1; k++) {
      const a = rv.pts[k], z = rv.pts[k + 1], steps = Math.ceil(hav(a, z) / (cell / 3));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, [c, r] = toCR(a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) water[rr * cols + cc] = 1;
        }
      }
    }
    // emergency transportation / lifeline routes: cheaper to travel (responders clear these first)
    for (const ln of env.prefer || []) for (let k = 0; k < ln.length - 1; k++) {
      const a = ln[k], z = ln[k + 1], steps = Math.max(1, Math.ceil(hav(a, z) / (cell / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, [c, r] = toCR(a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t);
        if (c >= 0 && r >= 0 && c < cols && r < rows) pref[r * cols + c] = 1;
      }
    }
    // open bridges punch a gap
    const gap = Math.max(2, Math.ceil(160 / cell));
    for (const br of env.bridges || []) {
      if (!bridgeOpen(br, env.mode, env.overrides)) continue;
      const [c, r] = toCR(br.lat, br.lng);
      for (let dr = -gap; dr <= gap; dr++) for (let dc = -gap; dc <= gap; dc++) {
        if (dr * dr + dc * dc > gap * gap) continue;
        const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) water[rr * cols + cc] = 0;
      }
    }
    for (let i = 0; i < N; i++) cost[i] = water[i] ? Infinity : hz[i] * (pref[i] ? PREFER : 1);
    return { b, cell, cols, rows, N, hz, water, cost, toLL, toCR };
  }

  function nearestDry(G, lat, lng) {
    let [c, r] = G.toCR(lat, lng);
    c = Math.max(0, Math.min(G.cols - 1, c)); r = Math.max(0, Math.min(G.rows - 1, r));
    if (G.cost[r * G.cols + c] < Infinity) return r * G.cols + c;
    for (let d = 1; d < 40; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.abs(dr) !== d && Math.abs(dc) !== d) continue;
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < G.cols && rr < G.rows && G.cost[rr * G.cols + cc] < Infinity) return rr * G.cols + cc;
    }
    return r * G.cols + c;
  }

  /* ---------- Dijkstra over the grid (binary heap) ---------- */
  function dijkstra(G, src) {
    const { cols, rows, N, cost } = G, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const hk = [], hv = [];
    const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]];[hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
    const pop = () => {
      const v = hv[0], k = hk[0], lk = hk.pop(), lv = hv.pop();
      if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]];[hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } }
      return [k, v];
    };
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    dist[src] = 0; push(0, src);
    while (hk.length) {
      const [d, u] = pop(); if (d > dist[u]) continue;
      const uc = u % cols, ur = (u / cols) | 0;
      for (const [dc, dr, s] of NB) {
        const c = uc + dc, r = ur + dr; if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const v = r * cols + c; if (cost[v] === Infinity) continue;
        if (dc && dr && (cost[ur * cols + c] === Infinity || cost[r * cols + uc] === Infinity)) continue; // no corner cutting past water
        const nd = d + s * (cost[u] + cost[v]) / 2;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); }
      }
    }
    return { dist, prev, src };
  }

  function trace(G, D, from) { // path from `from` back to D.src
    const out = []; let u = from, guard = 0;
    if (D.dist[from] === Infinity) return null;
    while (u !== -1 && guard++ < G.N) { out.push(u); if (u === D.src) break; u = D.prev[u]; }
    return out;
  }

  // shorten the stair-step grid path where a straight line stays as safe as the original
  function smooth(G, path) {
    if (!path || path.length < 3) return path;
    const cr = i => [i % G.cols, (i / G.cols) | 0];
    const lineOK = (a, b, maxC) => {
      const [c0, r0] = cr(a), [c1, r1] = cr(b), n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)) * 2;
      for (let s = 0; s <= n; s++) {
        const c = Math.round(c0 + (c1 - c0) * s / n), r = Math.round(r0 + (r1 - r0) * s / n), v = G.cost[r * G.cols + c];
        if (v === Infinity || v > maxC) return false;
      }
      return true;
    };
    const out = [path[0]]; let i = 0;
    while (i < path.length - 1) {
      let best = i + 1, maxC = 1;
      for (let k = i + 1; k < path.length; k++) {
        maxC = Math.max(maxC, G.cost[path[k]]);
        if (k - i > 120) break;
        if (lineOK(path[i], path[k], maxC)) best = k;
      }
      out.push(path[best]); i = best;
    }
    return out;
  }

  function toLatLngs(G, idxPath) { return idxPath.map(i => G.toLL(i % G.cols, (i / G.cols) | 0)); }

  /* ---------- evaluating any polyline ([lat,lng] points) ---------- */
  // metres of a line inside each hazard kind; weighted = sum of metres x (cost - 1)
  function exposure(H, line, step) {
    step = step || 20; let len = 0, weighted = 0; const by = {};
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1], d = hav(a, b); len += d;
      const n = Math.max(1, Math.round(d / step));
      for (let s = 0; s < n; s++) {
        const t = (s + 0.5) / n, h = hazardAt(H, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        if (h) { by[h.kind] = (by[h.kind] || 0) + d / n; weighted += (d / n) * (h.cost - 1); }
      }
    }
    const total = Object.values(by).reduce((x, y) => x + y, 0);
    return { len, by, total, weighted, m5: by.liq5 || 0, m4: by.liq4 || 0 };
  }

  function segX(p1, p2, p3, p4) { // intersection of segments in lat/lng space (fine at city scale)
    const d = (p2[1] - p1[1]) * (p4[0] - p3[0]) - (p2[0] - p1[0]) * (p4[1] - p3[1]); if (!d) return null;
    const ua = ((p3[1] - p1[1]) * (p4[0] - p3[0]) - (p3[0] - p1[0]) * (p4[1] - p3[1])) / d;
    const ub = ((p3[1] - p1[1]) * (p2[0] - p1[0]) - (p3[0] - p1[0]) * (p2[1] - p1[1])) / d;
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
    return [p1[0] + ua * (p2[0] - p1[0]), p1[1] + ua * (p2[1] - p1[1])];
  }

  // which bridges a line crosses, and whether any is closed
  function crossings(line, env) {
    const out = [];
    for (const rv of env.rivers) for (let k = 0; k < line.length - 1; k++) for (let j = 0; j < rv.pts.length - 1; j++) {
      const x = segX(line[k], line[k + 1], rv.pts[j], rv.pts[j + 1]); if (!x) continue;
      let best = null, bd = Infinity;
      for (const b of env.bridges) { const d = hav(x, [b.lat, b.lng]); if (d < bd) { bd = d; best = b; } }
      const near = bd < BRIDGE_SNAP_M ? best : null;
      out.push({ river: rv.name, at: x, bridge: near, open: near ? bridgeOpen(near, env.mode, env.overrides) : null });
    }
    return out;
  }

  function score(e) { return e.len + e.weighted / 3; }

  // waypoints for street routing: every ~1.2 km along the corridor, plus each open bridge it uses
  function viaPoints(line, env, spacing) {
    spacing = spacing || 1200;
    const pts = [line[0]]; let acc = 0;
    for (let k = 1; k < line.length - 1; k++) { acc += hav(line[k - 1], line[k]); if (acc >= spacing) { pts.push(line[k]); acc = 0; } }
    for (const c of crossings(line, env)) if (c.bridge && c.open) {
      // insert bridge midpoint in order: after the nearest preceding waypoint
      let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = hav(p, c.at); if (d < bd) { bd = d; bi = i; } });
      pts.splice(bi + 1, 0, [c.bridge.lat, c.bridge.lng]);
    }
    pts.push(line[line.length - 1]);
    return pts.slice(0, 24);
  }

  function padBounds(points, padM) {
    let s = 90, w = 180, n = -90, e = -180;
    for (const [la, ln] of points) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, ln); e = Math.max(e, ln); }
    const dLat = padM / 110540, dLng = padM / (111320 * Math.cos((s + n) / 2 * D2R));
    return { s: s - dLat, n: n + dLat, w: w - dLng, e: e + dLng };
  }

  const api = { hav, fromGeoJSON, buildIndex, hazardAt, inPoly, buildGrid, nearestDry, dijkstra, trace, smooth, toLatLngs, exposure, crossings, bridgeOpen, score, viaPoints, padBounds, COST, PREFER };
  if (typeof module !== 'undefined') module.exports = api; else root.P2S_ENGINE = api;
})(typeof window !== 'undefined' ? window : globalThis);
