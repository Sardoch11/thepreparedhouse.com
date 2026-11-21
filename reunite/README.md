# Path2Safe Reunite (Quake2Safe prototype)

A phone-first web app that helps a family find each other after a major Portland earthquake:

- **Where is everyone?** Each phone shares its GPS position and status (OK / Need help / Injured).
- **What's dangerous?** Real DOGAMI liquefaction susceptibility zones (high and very high), Willamette and Columbia bridge status, and Portland's 50 BEECN help points.
- **How do we get back together?** It picks a meeting point (or suggests the *fairest* one, the point where the longest trip is shortest) and plans a route for every person that steers around hazard zones and crosses rivers only on bridges expected to stay open.
- **Works when networks don't.** Hazard data, the app and viewed map tiles are saved on the phone. Offline, it still draws a safe corridor for each person. A text check-in message carries location by SMS when data is down.

## Files

| File | What it does |
|---|---|
| `index.html` | Layout and styles (Prepared House colors and fonts) |
| `app.js` | GPS, family sync, hazard download, route planning, check-ins |
| `engine.js` | Routing engine: hazard index, cost grid, Dijkstra, exposure scoring, bridge checks (no DOM, testable in Node) |
| `data.js` | Bundled offline data: bridges, river lines, 50 BEECN sites, demo family |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icon.svg` | "Add to Home Screen" install |

## Run it

GPS and offline mode need HTTPS. Easiest options:

1. **GitHub Pages** (you already host thepreparedhouse.com there): copy this folder into the site repo as `/reunite/`, commit, push. Open `https://thepreparedhouse.com/reunite/` on a phone, then use "Add to Home Screen."
2. **Local test on a computer:** `python3 -m http.server 8000` in this folder, then open `http://localhost:8000` (browsers treat localhost as secure).

Tap **Load demo family** on the Family tab, then **Reunite → Plan routes for everyone** to see it work without real family members.

## Live family sharing (optional, about 10 minutes)

Without this, the app still works with text check-ins. For live location sharing:

1. Create a free Firebase project at console.firebase.google.com and add a **Realtime Database**.
2. Set its rules so only someone who knows a family code can read or write that family:

```json
{
  "rules": {
    "families": {
      "$code": {
        ".read": "$code.length >= 12",
        ".write": "$code.length >= 12"
      }
    }
  }
}
```

3. In the app: **Setup → Database URL** (looks like `https://your-project-default-rtdb.firebaseio.com`), tap **Make a new code**, share that code with family members in person or by text, and everyone taps **Join family**.

The family code works like a password. This is prototype-grade security. A production app needs real sign-in (Firebase Auth) and per-family membership rules.

## How the routing works

1. **Cost grid.** The area around everyone is cut into cells (35 m or larger, at most about 320 × 320). Very high liquefaction cells cost 30× normal travel, high cells cost 8×. River cells are impassable except where an open bridge is.
2. **One search from the meeting point.** Dijkstra runs once outward from the meeting point, which gives every family member's safest path in a single pass. "Fairest point" runs one search per person and picks the candidate (saved places and BEECN sites outside hazard zones) with the shortest worst-case trip.
3. **Street routes when online.** The app asks OSRM (FOSSGIS servers, walking/bike/car profiles) for the direct route and a route forced through the safe corridor's waypoints and open bridges. It rejects any route that crosses a closed bridge, then picks the one with the lowest hazard-weighted length. If the street route runs through more hazard than the corridor, it says so and shows the corridor as a thin dashed line.
4. **Offline:** the corridor itself is shown (dashed) with distance and hazard exposure.

Bridge defaults: Sellwood and Tilikum are treated as usable (both were designed for a major quake; Tilikum carries no cars). All other Willamette and Columbia crossings are assumed closed. Anyone can change a bridge on **Map data → Bridges: field reports** when responders announce openings.

## Data sources

- Liquefaction susceptibility: DOGAMI Open-File Report O-19-09 (2019), served by Multnomah County's NHMP Hazards Data map service, layer 3, classes 4 (high) and 5 (very high). Downloaded live (about 3,400 areas, 1.5 MB) and saved on the phone.
- BEECN sites: Portland Bureau of Emergency Management via PortlandMaps open data (layer 92), 50 sites, pulled November 2026.
- Bridge seismic status: Multnomah County (Sellwood seismic design goals; "none of downtown Portland's Willamette River vehicular bridges will be immediately usable after a major earthquake"); KGW summary of agency reports (Tilikum: minor damage). Burnside replacement still in design, construction start not set (Multnomah County, Nov 2025).
- Base map: © OpenStreetMap contributors. Routing: OSRM on routing.openstreetmap.de.

## Known limits (be upfront about these in the capstone)

- Liquefaction maps show *susceptibility*, not where damage will happen. Landslide, building collapse, fire and the CEI Hub fuel-tank area in NW Portland are not yet layers.
- Bridge positions and river lines are hand-placed approximations, accurate to roughly 100–200 m.
- Public OSM tiles and FOSSGIS routing are fine for a demo but not for a launched product. Their usage policies forbid heavy traffic and bulk tile downloads. For launch, self-host vector tiles (for example a Protomaps PMTiles file) and a routing server, or buy a commercial plan.
- Cell data may be down for days after a Cascadia quake. Live sharing depends on it; text check-ins and the offline corridor don't.
- Not a substitute for 911, official alerts or a written household plan.

## Ideas for the next version

Landslide and CEI Hub layers, offline map package for the family's area, Bluetooth/mesh sharing between nearby phones, school district and employer reunification sites pulled from each family's Prepared House plan, and accessibility routing for family members who can't walk long distances.
