# Milestone: UI redesign

> **Historical note.** This guide was written during the sandbox sprint (Nov 17 to 21, 2026), before the first real runs of this part of the app. Its "not run" statements may be out of date. For current status see `docs/DAILY_PROGRESS.md` and `docs/E2E_CHECKLIST.md`.

This milestone changes only how the web app looks and is organised. The API, the database, sign in, document upload, AI extraction and the cross-check logic were not changed.

**Important:** the agent that wrote this code could not run `npm install`, `npm run dev:web` or the build (no `node_modules`, the package registry was blocked). Nothing was rendered in a browser. The pure logic is tested, but the pages, the map and the new packages are **untested**. If anything below fails, copy the full error text and send it back.

## What changed

- New look with a light, dark and system theme. The choice is saved in your browser.
- New public landing page at `/`, and a split-screen `/login` and `/register`.
- A left sidebar and top bar for signed-in pages, a Ctrl+K search, and toast messages.
- Pages: `/dashboard`, `/shipments`, `/shipments/:id` (Overview, Documents, Cross-check and Route tabs), `/map` (Global Map), `/documents`, `/alerts`, `/settings`, and a 404 page.
- A real map on the route tab, the Global Map and the landing page. Leaflet draws a self-hosted world basemap (Natural Earth, public domain) with port pins, routes that follow hand-drawn sea lanes, and maritime chokepoints. No tile service and no API key.
- New packages in `apps/web/package.json`: `lucide-react` (icons), `framer-motion` (animation), `leaflet` (map, version 1.9.4, no web worker and no WebGL), `cmdk` (search palette), `sonner` (toasts).

## Steps (Windows PowerShell)

1. Go to the project and switch branch:

   ```powershell
   cd D:\KIRO\PortChimera
   git checkout feat/ui-redesign
   ```

2. Install packages. This is required because of the five new packages:

   ```powershell
   npm install
   ```

3. Run the tests. Expect them to pass:

   ```powershell
   npm test
   ```

4. Build the web app. This is the first real compile of the new code. **Send back any error text.**

   ```powershell
   npm run build -w @portchimera/web
   ```

5. `npm install` changed `package-lock.json`. Commit it:

   ```powershell
   git add package-lock.json
   git commit -m "chore: update lockfile for UI dependencies"
   ```

6. Start the API in this window:

   ```powershell
   npm run dev:api
   ```

7. Open a second PowerShell window in the same folder and start the web app:

   ```powershell
   npm run dev:web
   ```

8. Open <http://localhost:5173> in your browser. Your `apps/web/.env` must contain `VITE_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Browser checklist

Tick each one. Note what looks wrong.

- [ ] Theme toggle (light, dark, system) works, survives a page reload, and the page does not flash the wrong colour while loading.
- [ ] Landing page `/` shows the header, hero with the sample Shanghai to Karachi card, capabilities, how it works, the network map and the footer. The sample card is labelled illustrative.
- [ ] Press Ctrl+K. The search opens and finds pages, ports and your shipments.
- [ ] Register a new account. Email confirmation is off in your Supabase project, so you should land on `/dashboard`.
- [ ] Log in as `alice@example.com`. You land on `/dashboard` and the cards show your counts.
- [ ] Create a shipment (for example `SHP-003`, Shanghai to Karachi).
- [ ] Open the shipment. The header and the tabs Overview, Documents, Cross-check and Route work.
- [ ] Route tab: the map shows land and sea, a line that follows the sea (around Malaysia, south of Sri Lanka, never across India) drawing from Shanghai to Karachi, port pins, diamond chokepoint markers, a legend, and a line under the map naming the chokepoints on the route. Click a pin to see its name and code. Hover a diamond to see its note. Try Fastest, Cheapest and Lowest risk. Switch the theme and check land, sea and pins change colour without the map reloading.
- [ ] Landing page: the "A sample of the port network" map frames the five ports (not a tiny world) and shows one sea lane from Shanghai to Jebel Ali. The hero map shows Shanghai to Karachi along the sea.
- [ ] Global Map (`/map`): the world fits the box once, with no repeated world or repeated pins when you drag or zoom out. All ports show. Click a pin and the list highlights; click a list item and the map moves to it.
- [ ] Map manual checks (the `MaritimeMap` component has no automated test, only the pure helpers in `mapData` do): zoom buttons and popups work with the keyboard and a screen reader; the arc draws once and does not replay when you select a port; switching theme recolours the basemap and keeps pins and routes; the Shanghai to Los Angeles lane is drawn in two pieces at the date line, not as a line across the world; the map works offline because it loads nothing from the network; if Leaflet cannot draw, the text fallback appears.
- [ ] Documents and Cross-check tabs still upload, review and compare as before.
- [ ] Collapse and expand the sidebar.
- [ ] Narrow the browser window to phone width and check the menu and pages.
- [ ] Visit an unknown address such as `/nothing`. You see the 404 page.
- [ ] The browser tab shows the compass favicon and the PortChimera title.
- [ ] Log in as `bob@example.com` and confirm Alice's shipments are not visible.

## Things to know

- **Why CARTO was dropped.** CARTO's basemap tiles now require an API key. Without one every tile showed the watermark "API KEY REQUIRED". The map no longer uses any tile service.
- **The basemap is bundled.** `apps/web/src/assets/world-110m.json` (about 160 KB) holds the country polygons from [Natural Earth](https://www.naturalearthdata.com/) 1:110m, which is public domain. The attribution "Natural Earth, public domain" stays on the map. To rebuild the file from a saved copy of `ne_110m_admin_0_countries.geojson`, run `node scripts/build-world-geojson.mjs <path>`.
- **Sea lanes are hand-drawn.** `apps/web/src/lib/seaLanes.js` lists waypoints for each of the 30 seeded lanes, through the Strait of Malacca, south of Sri Lanka, Bab-el-Mandeb, the Red Sea and Suez Canal, the Mediterranean, the Strait of Gibraltar, the English Channel, around the Cape of Good Hope and across the Pacific. A test (`apps/web/test/seaLanes.test.js`) samples every lane every 25 km and fails if a sample is on land in the bundled polygons, except within 60 km of a port or a narrow passage that the coarse polygons cannot resolve. The lanes only change how the map draws a leg. Routing and the API do not read them.
- **Chokepoints.** `apps/web/src/lib/chokepoints.js` lists Malacca, Hormuz, Bab-el-Mandeb, Suez, Gibraltar, Dover, the Cape of Good Hope, the Taiwan Strait and Panama (not used by the seeded network). The map draws them as diamonds and highlights the ones the drawn route passes, using `chokepointsOnPath`.
- **Migration 0002 is not run on your database yet.** The cross-check page may show an error until you run `supabase/migrations/0002_discrepancy_finding_key.sql`. Steps are in `docs/MILESTONE_CROSSCHECK.md`.
- **Route lines are illustrative.** They follow hand-drawn sea lanes between ports, not real vessel tracks, and are not for navigation.
- Crisis rerouting around port strikes has a built core, but its screen is not built yet. The map already accepts `routes` and `disruptedCodes` for it.

## Known risks

- Package versions in `package.json` were written by hand and never installed. A version may not exist or may differ in behaviour.
- Icon names from `lucide-react` were not checked against the installed version. A wrong name breaks the build with an "is not exported" error.
- The new map (canvas basemap, DOM pins, sea lanes, chokepoints) was verified only by pure-logic tests, including the land-crossing test. It was not rendered in a browser. The 110m polygons are coarse, so a lane that passes the test can still look close to a coast at high zoom.
- Map code, animation, the Ctrl+K palette and all page layouts were never rendered.
