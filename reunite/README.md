# Path2Safe Reunite (Quake2Safe prototype)

A phone-first web app that helps a family find each other after a major Portland earthquake:

- **Where is everyone?** Each phone shares its GPS position and status (OK / Need help / Injured).
- **What's dangerous?** Real map layers covering Multnomah, Washington and Clackamas counties (plus Vancouver): DOGAMI liquefaction zones (high and very high), DOGAMI SLIDO landslide deposits, FEMA 1% annual-chance flood zones (floodways weighted higher), the regional emergency transportation routes and ODOT seismic lifelines (which routes favour), the ODF wildland-urban interface (shown only), State Fire Marshal fire stations, bridge status (including Clackamas County's Abernethy, Oregon City Arch and Boone bridges) and Portland's 50 BEECN help points. Each layer can be shown or hidden, and turned on or off for routing.
- **How do we get back together?** It picks a meeting point (or suggests the *fairest* one, the point where the longest trip is shortest) and plans a route for every person that steers around hazard zones and crosses rivers only on bridges expected to stay open.
- **Add family from your contacts.** On Android (Chrome) the app opens the phone's contact picker. On iPhone, which doesn't allow web apps to read contacts, you import a shared contact card (.vcf). Contacts stay on the phone. Each person gets an Invite button that texts them the link and family code.
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

## Three ways to plan (Reunite screen)
- **Meet up:** everyone (or whoever you pick under "Who's going") routes to the meeting point.
- **Go to someone:** routes to a family member's last shared location. People marked Injured or Need help are listed first. Everyone else goes by default, except anyone marked Injured. The app names who's closest, and if the person has a phone number saved, it offers a "Text them you're coming" message with your time estimate and check-in. The Family screen has a "Go to" button on each person who has a location.
- **Pick up:** routes you to a school, child care centre or release site, then on to home or the meeting point with the children you picked. Saved places with school-like names get a "Pick up" button in Setup. The screen reminds parents that many schools release students at a separate site, only to listed emergency contacts, with photo ID.

## Route results
- Results appear at the top of the Reunite screen, above the planning controls ("Change plan" jumps back to them).
- Each traveler gets up to three options, tagged Recommended, Fastest, Fewest hazards or Backup route, with the difference from the recommended route (distance, hazard metres, which bridge). The app builds them from the direct street route, a route steered along the safe corridor, an extra-cautious corridor (hazard costs raised to the power 1.7), and, when the trip crosses a river, a route over each other open bridge within a sensible detour. Tapping an option, or its grey dotted line on the map, switches to it.
- Turn-by-turn directions use compass headings ("Turn right onto SE 3rd Ave, heading south · 437 m"). Tiny jogs under 60 m and repeated street names fold together. Steps that pass through hazard zones or over a bridge are flagged. Offline, directions are compass legs along the safe line.
- Safety: a "Safety before you go" panel (aftershocks and Drop, Cover and Hold On; damaged buildings; downed lines; floodwater, where 6 inches of moving water can knock you off your feet and 12 inches can carry away a car; bridges and overpasses when driving; shoes and supplies; texting), with sources named (National Weather Service, Ready.gov). Each route also gets notes for the liquefaction, landslide and flood ground it crosses, the bridges it uses and long walks.
- Street routes are rejected if any step's street name is a closed bridge, as well as by the river-line check, because the approximate river line misses some crossings (Ross Island).

## Always a path, with risk advice
The app always returns a path. If no route avoids bridges that are expected to be closed, it routes over the best at-risk crossing and labels it "Best available: risky" with a note to confirm the bridge is open. When a route over an at-risk bridge is much shorter (under 75% of the time) than every safe route, the app adds it as "Only if [bridge] is open". Driving routes on freeways note that bridges, overpasses and ramps may be closed for inspection. With no mapped path at all, the app gives a compass bearing and straight-line distance.

## Groups and out-of-area contacts
- People sit in groups: My household, Out-of-area contacts, and any new groups (another family next door, grandparents). "Add people to" picks the group; Edit moves someone between groups or adds a phone and email.
- Out-of-area contacts get updates only. They aren't routed or tracked. Each has a Text update (or Email update) button, and the Check-in screen has a "Tell people outside the area" card with a plain-language family status summary, a map link and Text, Email, Share and Copy buttons. Setup adds a step: "Add an out-of-area contact" (Ready.gov advises an out-of-town contact that everyone checks in with).
- Pick up works across groups: a neighbor can pick up the Garcias' child, and the results include "Let The Garcias know" with two ready messages (when you leave, when you have them). Go to someone offers a message to that person's group. Every plan ends with "Update out-of-area contacts".

## Quake severity (Reunite screen)
"How strong is the quake?" sets the scenario for routing, bridge status and notes:
| Level | Reference | Bridges not built or upgraded for earthquakes | Hazard weight |
| --- | --- | --- | --- |
| Mild | 1993 Scotts Mills, M5.6 | Assumed open (may close briefly for inspection) | 25% |
| Medium | Strong local quake | Closed where at least 3 of 16 approach samples (rings at 250 m and 500 m) fall on very high liquefaction ground; otherwise open with caution | 60% |
| Major | DOGAMI Portland Hills fault M6.8 scenario | Assumed closed | 100% |
| Severe | Cascadia Subduction Zone M9 | Assumed closed | 140% |
Sellwood, Tilikum and Abernethy (built or upgraded for earthquakes) are assumed to reopen first at every level; routes over them in Major and Severe carry a disclaimer that they still need inspection and may stay closed for hours or longer. Field reports (Open/Closed in Map data) override the scenario. Results open with a scenario banner stating these are planning assumptions, not a forecast.

## Family registration
A "Register your family" card (Family screen) and "Your registration" (Setup) collect name, email, mobile, home address (all required), household size, whether children are in school or child care, and an unticked-by-default consent to be contacted about services. The form also asks whether to save the address as Home and where the family should reunite (at home, somewhere else, not now); the app geocodes the address, saves Home, and sets the reunite location. Registrations post to the Google Form "Path2Safe family registration" in paul@sardoch.com (responses in the Google Sheet "Path2Safe family registrations"). They queue on the phone when offline and send when back online. Edits resend with the same Registration ID.
