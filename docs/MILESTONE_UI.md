# Milestone: UI redesign

This milestone changes only how the web app looks and is organised. The API, the database, sign in, document upload, AI extraction and the cross-check logic were not changed.

**Important:** the agent that wrote this code could not run `npm install`, `npm run dev:web` or the build (no `node_modules`, the package registry was blocked). Nothing was rendered in a browser. The pure logic is tested, but the pages, the map and the new packages are **untested**. If anything below fails, copy the full error text and send it back.

## What changed

- New look with a light, dark and system theme. The choice is saved in your browser.
- New public landing page at `/`, and a split-screen `/login` and `/register`.
- A left sidebar and top bar for signed-in pages, a Ctrl+K search, and toast messages.
- Pages: `/dashboard`, `/shipments`, `/shipments/:id` (Overview, Documents, Cross-check and Route tabs), `/map` (Global Map), `/documents`, `/alerts`, `/settings`, and a 404 page.
- A real map (Leaflet with free CARTO tiles) on the route tab, the Global Map and the landing page.
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
- [ ] Route tab: the map shows CARTO tiles, a curved line drawing from Shanghai to Karachi, port pins and a legend. Click a pin to see its name and code. Try Fastest, Cheapest and Lowest risk. Switch the theme and check the map tiles change.
- [ ] Global Map (`/map`): all ports show. Click a pin and the list highlights; click a list item and the map moves to it.
- [ ] Map manual checks (the `MaritimeMap` component has no automated test, only the pure helpers in `mapData` do): zoom buttons and popups work with the keyboard and a screen reader; the arc draws once and does not replay when you select a port; switching theme swaps tiles and keeps pins and routes; with the network blocked, or the map not loading within 15 seconds, the text fallback appears; a missing glyph or sprite does not hide a working map.
- [ ] Documents and Cross-check tabs still upload, review and compare as before.
- [ ] Collapse and expand the sidebar.
- [ ] Narrow the browser window to phone width and check the menu and pages.
- [ ] Visit an unknown address such as `/nothing`. You see the 404 page.
- [ ] The browser tab shows the compass favicon and the PortChimera title.
- [ ] Log in as `bob@example.com` and confirm Alice's shipments are not visible.

## Things to know

- **The map needs internet** to load CARTO tiles, to load. If it fails, the page lists the stops as text instead.
- **CARTO terms and attribution:** the basemaps are free without a key for light, non-commercial use. The attribution "© OpenStreetMap contributors © CARTO" must stay visible. Check the CARTO terms before any commercial use.
- **Migration 0002 is not run on your database yet.** The cross-check page may show an error until you run `supabase/migrations/0002_discrepancy_finding_key.sql`. Steps are in `docs/MILESTONE_CROSSCHECK.md`.
- **Route lines are illustrative.** They are great-circle arcs between ports, not real vessel tracks.
- Crisis rerouting around port strikes has a built core, but its screen is not built yet. The map already accepts `routes` and `disruptedCodes` for it.

## Known risks

- Package versions in `package.json` were written by hand and never installed. A version may not exist or may differ in behaviour.
- Icon names from `lucide-react` were not checked against the installed version. A wrong name breaks the build with an "is not exported" error.
- The port name labels on the map reuse a font from the loaded CARTO style. If labels do not appear, tell me.
- Map code, animation, the Ctrl+K palette and all page layouts were never rendered.
