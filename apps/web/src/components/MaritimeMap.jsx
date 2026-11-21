import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ILLUSTRATIVE_ROUTE_NOTE,
  MAP_ATTRIBUTION,
  TILE_MAX_ZOOM,
  TILE_SUBDOMAINS,
  boundsOf,
  disruptedToGeoJSON,
  portsToGeoJSON,
  progressiveLine,
  routesToGeoJSON,
  styleFor,
  toLatLngs,
} from '../lib/mapData.js';
import { useTheme } from './ThemeProvider.jsx';

// [[south, west], [north, east]] in Leaflet order.
const WORLD_BOUNDS = [
  [-40, -130],
  [65, 170],
];
const DRAW_MS = 2200;
const LOAD_TIMEOUT_MS = 15000;
const LABEL_MIN_ZOOM = 4;
const MANY_PORTS = 8;

// Layer colours cannot use CSS variables, so each theme has its own set.
const PALETTE = {
  light: {
    primary: '#0e7490',
    alternative: '#7c3aed',
    blocked: '#b91c1c',
    port: '#0b1f3a',
    highlight: '#0e7490',
    warn: '#b45309',
    ring: '#ffffff',
  },
  dark: {
    primary: '#22d3ee',
    alternative: '#a78bfa',
    blocked: '#f87171',
    port: '#e8eef7',
    highlight: '#22d3ee',
    warn: '#fbbf24',
    ring: '#0a1220',
  },
};

const TONE_LABELS = {
  primary: 'Planned route',
  alternative: 'Alternative route',
  blocked: 'Blocked',
};

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Content is built with textContent only, never from an HTML string.
function defaultPopup(port) {
  const root = document.createElement('div');
  const name = document.createElement('div');
  name.style.fontWeight = '700';
  name.textContent = port.name;
  const code = document.createElement('div');
  code.style.fontFamily = 'var(--font-mono)';
  code.style.fontSize = '12px';
  code.style.opacity = '0.75';
  code.textContent = port.country ? `${port.code} · ${port.country}` : port.code;
  root.append(name, code);
  return root;
}

function toNode(content) {
  if (typeof content !== 'string') return content;
  const el = document.createElement('div');
  el.textContent = content;
  return el;
}

// Fits the route (or the ports) or the world. Does nothing while the container has no size.
function fitMap(map, data, fit, animate) {
  const size = map.getSize();
  if (!size.x || !size.y) return false;
  let bounds = WORLD_BOUNDS;
  if (fit === 'route') {
    const coords = data.routesGeoJSON.features.flatMap((f) => f.geometry.coordinates);
    const b = boundsOf(coords.length ? coords : data.portPoints);
    if (b) {
      bounds = [
        [b[0][1], b[0][0]],
        [b[1][1], b[1][0]],
      ];
    }
  }
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5, animate, duration: 0.6 });
  return true;
}

/**
 * Interactive Leaflet map with a CARTO raster basemap, port pins and curved (great-circle) route arcs.
 * The basemap follows the app theme. Needs no web worker and no WebGL. Falls back to a text list if the tiles fail to load.
 * The map only draws what it is given. It never computes routes.
 *
 * Props contract (stable, the crisis rerouting screen only needs `routes` and `disruptedCodes`):
 * - ports: Array<{code, name, country?, lat, lon}>  port pins. Defaults to route stops with a code.
 * - routes: Array<{id, stops: Array<{code?, name?, lat, lon}>, tone, label}>
 *     tone 'primary' (solid), 'alternative' (solid, second colour), 'blocked' (red, dashed).
 * - route: Array<stop>  shorthand for one primary route. Ignored when `routes` is given.
 * - disruptedCodes: string[]  port codes drawn with a warning ring and a pulsing marker.
 * - highlightCodes: string[]  port codes drawn larger in the accent colour.
 * - selectedCode: string  highlights that port, flies to it and opens its popup.
 * - animateRoute: boolean  draw non-blocked routes progressively with a moving dot.
 *     Skipped when the user prefers reduced motion.
 * - onPortClick: (port) => void
 * - popupRender: (port) => HTMLElement | string  replaces the default popup (name and mono code).
 * - height: number | string (default 360), interactive: boolean (default true)
 * - fit: 'route' | 'world', legend: boolean (default true), className, ariaLabel
 * Changing ports, routes, disruptedCodes or highlightCodes updates the map without recreating it.
 * @param {object} props
 */
export default function MaritimeMap({
  ports = [],
  route = [],
  routes,
  disruptedCodes = [],
  highlightCodes = [],
  selectedCode = '',
  animateRoute = false,
  onPortClick,
  popupRender,
  height = 360,
  interactive = true,
  legend = true,
  className = '',
  ariaLabel = 'Map of ports and shipping route',
  fit = 'route',
}) {
  const { resolved } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const [failed, setFailed] = useState(false);

  const routeList =
    routes ?? (route.length >= 2 ? [{ id: 'route', stops: route, tone: 'primary' }] : []);
  const stops = routeList.flatMap((r) => r.stops ?? []);
  const portList = ports.length ? ports : stops.filter((s) => s.code);
  const highlights = selectedCode ? [...highlightCodes, selectedCode] : highlightCodes;
  const data = {
    portsGeoJSON: portsToGeoJSON(portList, { highlightCodes: highlights }),
    routesGeoJSON: routesToGeoJSON(routeList),
    disruptedGeoJSON: disruptedToGeoJSON(portList, disruptedCodes),
    portPoints: portList.map((p) => [p.lon, p.lat]),
  };
  // Latest props for handlers that were registered once.
  const live = useRef({});
  live.current = {
    ...live.current,
    data,
    fit,
    theme: resolved,
    ports: portList,
    selectedCode,
    onPortClick,
    popupRender,
    animateRoute,
  };
  const renderedKey = useRef('');

  function showPopup(port) {
    const map = mapRef.current;
    if (!map) return;
    const content = live.current.popupRender?.(port) ?? defaultPopup(port);
    L.popup({ offset: [0, -4], closeButton: true })
      .setLatLng([port.lat, port.lon])
      .setContent(toNode(content))
      .openOn(map);
  }
  const showPopupRef = useRef(showPopup);
  showPopupRef.current = showPopup;

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    let map;
    try {
      map = L.map(container, {
        center: [20, 60],
        zoom: 2,
        zoomControl: interactive,
        attributionControl: true,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        scrollWheelZoom: false,
        worldCopyJump: true,
        minZoom: 1,
        maxBoundsViscosity: 0,
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    map.attributionControl.setPrefix(false);

    const reduce = prefersReducedMotion();
    const groups = {
      routes: L.layerGroup().addTo(map),
      disrupted: L.layerGroup().addTo(map),
      ports: L.layerGroup().addTo(map),
      dot: L.layerGroup().addTo(map),
    };
    const anim = { frame: 0, start: 0, lines: [], dot: null };

    // Wheel zoom would hijack page scrolling, so it turns on after a click and off when leaving.
    let wheelOn = false;
    function onMouseLeave() {
      if (wheelOn) map.scrollWheelZoom.disable();
      wheelOn = false;
    }
    if (interactive) {
      map.on('click', () => {
        if (wheelOn) return;
        wheelOn = true;
        map.scrollWheelZoom.enable();
      });
      container.addEventListener('mouseleave', onMouseLeave);
    }

    // Tiles. One tile error never hides the map. Only a map where nothing ever loads falls back.
    let tiles = null;
    let loaded = 0;
    let errors = 0;
    function addTiles(theme) {
      tiles?.remove();
      tiles = L.tileLayer(styleFor(theme), {
        subdomains: TILE_SUBDOMAINS,
        maxZoom: TILE_MAX_ZOOM,
        attribution: MAP_ATTRIBUTION,
      });
      tiles.on('tileload', () => {
        loaded += 1;
        readyRef.current = true;
      });
      tiles.on('tileerror', () => {
        errors += 1;
      });
      tiles.on('load', () => {
        if (loaded === 0 && errors > 0) setFailed(true);
      });
      tiles.addTo(map);
      tiles.bringToBack();
    }
    live.current.setTheme = addTiles;
    addTiles(live.current.theme);

    function toggleLabels() {
      const many = live.current.ports.length > MANY_PORTS;
      container.classList.toggle('pc-map-nolabels', many && map.getZoom() < LABEL_MIN_ZOOM);
    }
    map.on('zoomend', toggleLabels);

    // One requestAnimationFrame loop for the progressive route drawing and the moving dot.
    function tick(now) {
      const t = Math.min(1, (now - anim.start) / DRAW_MS);
      let tip = null;
      anim.lines.forEach((entry, i) => {
        const part = progressiveLine(entry.coords, t);
        entry.line.setLatLngs(toLatLngs(part.coordinates));
        if (i === 0) tip = part.tip;
      });
      if (anim.dot) {
        if (tip && t < 1) {
          anim.dot.setLatLng([tip[1], tip[0]]);
          if (!groups.dot.hasLayer(anim.dot)) anim.dot.addTo(groups.dot);
        } else {
          groups.dot.clearLayers();
        }
      }
      anim.frame = t < 1 ? requestAnimationFrame(tick) : 0;
    }

    // Rebuilds every overlay layer from the current props. Safe to call repeatedly.
    function render() {
      const { data: d, theme, animateRoute: draw } = live.current;
      const c = PALETTE[theme] ?? PALETTE.light;
      cancelAnimationFrame(anim.frame);
      anim.frame = 0;
      anim.lines = [];
      anim.dot = null;
      Object.values(groups).forEach((g) => g.clearLayers());

      const animate = draw && !reduce;
      let minLon = Infinity;
      let maxLon = -Infinity;
      d.routesGeoJSON.features.forEach((f) => {
        const blocked = f.properties.tone === 'blocked';
        const color = c[f.properties.tone] ?? c.primary;
        const lons = f.geometry.coordinates.map((p) => p[0]);
        minLon = Math.min(minLon, ...lons);
        maxLon = Math.max(maxLon, ...lons);
        // Arcs that cross the date line are drawn again one world over, so both ends have a pin.
        const shifts = [0];
        if (Math.max(...lons) > 180) shifts.push(-360);
        if (Math.min(...lons) < -180) shifts.push(360);
        shifts.forEach((shift) => {
          const coords = f.geometry.coordinates.map(([lon, lat]) => [lon + shift, lat]);
          const start = animate && !blocked ? progressiveLine(coords, 0).coordinates : coords;
          L.polyline(toLatLngs(start), {
            color,
            weight: 7,
            opacity: 0.14,
            lineCap: 'round',
            interactive: false,
          }).addTo(groups.routes);
          const line = L.polyline(toLatLngs(start), {
            color,
            weight: blocked ? 2.5 : 2.75,
            opacity: 1,
            lineCap: blocked ? 'butt' : 'round',
            lineJoin: 'round',
            dashArray: blocked ? '6 8' : undefined,
            interactive: false,
          }).addTo(groups.routes);
          if (animate && !blocked) anim.lines.push({ line, coords });
        });
      });
      // World copies of a pin, only where the route reaches, so the date line shows both ends.
      const copies = (lon) => {
        if (!d.routesGeoJSON.features.length || live.current.fit !== 'route') return [0];
        return [0, -360, 360].filter(
          (o) => o === 0 || (lon + o >= minLon - 1 && lon + o <= maxLon + 1),
        );
      };

      d.disruptedGeoJSON.features.forEach((f) => {
        const [lon, lat] = f.geometry.coordinates;
        copies(lon).forEach((o) => {
          if (!reduce) {
            L.circleMarker([lat, lon + o], {
              radius: 11,
              stroke: false,
              fillColor: c.warn,
              fillOpacity: 0.35,
              className: 'pc-pulse',
              interactive: false,
            }).addTo(groups.disrupted);
          }
          L.circleMarker([lat, lon + o], {
            radius: 11,
            color: c.warn,
            weight: 2.5,
            fill: false,
            interactive: false,
          }).addTo(groups.disrupted);
        });
      });

      d.portsGeoJSON.features.forEach((f) => {
        const { code, name, highlight } = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        copies(lon).forEach((o) => {
          const marker = L.circleMarker([lat, lon + o], {
            radius: highlight ? 8 : 5.5,
            color: c.ring,
            weight: 2,
            fillColor: highlight ? c.highlight : c.port,
            fillOpacity: 1,
          });
          marker.bindTooltip(name, {
            permanent: true,
            direction: 'bottom',
            offset: [0, 6],
            className: 'pc-port-label',
          });
          marker.on('click', () => {
            const port = live.current.ports.find((p) => p.code === code);
            if (!port) return;
            live.current.onPortClick?.(port);
            showPopupRef.current(port);
          });
          marker.addTo(groups.ports);
        });
      });

      if (animate && anim.lines.length) {
        anim.dot = L.circleMarker([0, 0], {
          radius: 5,
          color: c.ring,
          weight: 2,
          fillColor: c.primary,
          fillOpacity: 1,
          interactive: false,
        });
        anim.start = performance.now();
        anim.frame = requestAnimationFrame(tick);
      }
      toggleLabels();
    }
    live.current.render = render;

    // The first fit needs a container with a size, so it may wait for the ResizeObserver.
    let fitted = false;
    function firstFit() {
      if (fitted) return;
      if (!fitMap(map, live.current.data, live.current.fit, false)) return;
      fitted = true;
      const first = live.current.ports.find((p) => p.code === live.current.selectedCode);
      if (first) {
        map.setView([first.lat, first.lon], 4, { animate: false });
        showPopupRef.current(first);
      }
    }
    render();
    renderedKey.current = live.current.key;
    firstFit();

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      firstFit();
    });
    observer.observe(container);

    // Tiles that never arrive raise no single error, so show the fallback after a wait.
    const timer = setTimeout(() => {
      if (loaded === 0) setFailed(true);
    }, LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(anim.frame);
      observer.disconnect();
      container.removeEventListener('mouseleave', onMouseLeave);
      readyRef.current = false;
      live.current.render = null;
      live.current.setTheme = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Switch the basemap with the theme, without recreating the map.
  const lastTheme = useRef(resolved);
  useEffect(() => {
    if (lastTheme.current === resolved) return;
    lastTheme.current = resolved;
    live.current.setTheme?.(resolved);
  }, [resolved]);

  // Redraw the layers when ports, routes, markers or the theme change. Refit only for new geometry.
  const geometrySignature = JSON.stringify([
    portList.map((p) => p.code),
    routeList.map((r) => [r.id, r.tone, (r.stops ?? []).map((s) => [s.lat, s.lon])]),
    disruptedCodes,
    fit,
  ]);
  const key = JSON.stringify([geometrySignature, highlights, resolved, animateRoute]);
  live.current.key = key;
  const lastGeometry = useRef(geometrySignature);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || renderedKey.current === key) return;
    renderedKey.current = key;
    live.current.render?.();
    // Highlight-only changes (a port selection) must not refit the view.
    if (lastGeometry.current !== geometrySignature) {
      lastGeometry.current = geometrySignature;
      fitMap(map, live.current.data, live.current.fit, true);
    }
  }, [key, geometrySignature]);

  // Fly to and open the selected port.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCode) return;
    const port = live.current.ports.find((p) => p.code === selectedCode);
    if (!port || !map.getSize().x) return;
    const zoom = Math.max(map.getZoom(), 4);
    if (prefersReducedMotion()) map.setView([port.lat, port.lon], zoom, { animate: false });
    else map.flyTo([port.lat, port.lon], zoom, { duration: 0.8 });
    showPopupRef.current(port);
  }, [selectedCode]);

  const tonesPresent = [...new Set(data.routesGeoJSON.features.map((f) => f.properties.tone))];
  const showLegend =
    legend && (tonesPresent.length > 0 || data.disruptedGeoJSON.features.length > 0);
  const colors = PALETTE[resolved] ?? PALETTE.light;

  const listing = stops.length ? stops : portList;

  return (
    <figure className={`m-0 ${className}`}>
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-surface-2"
        style={{ height }}
      >
        <div
          ref={containerRef}
          role="region"
          aria-label={ariaLabel}
          className="absolute inset-0"
          hidden={failed}
        />
        {failed && (
          <div role="alert" className="absolute inset-0 overflow-auto p-4 text-sm">
            <p className="font-bold text-fg">The map could not be loaded.</p>
            <p className="mt-1 text-muted">
              This can happen when the map tiles are blocked or you are offline. Stops are listed
              instead.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-fg">
              {listing.map((s, i) => (
                <li key={`${s.code ?? s.name}-${i}`}>
                  {s.name ?? s.code}
                  {s.code && <span className="ml-2 font-mono text-xs text-muted">{s.code}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {showLegend && (
        <ul
          aria-label="Map legend"
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
        >
          {tonesPresent.map((tone) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-5"
                style={{ background: colors[tone] }}
              />
              {TONE_LABELS[tone]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colors.port }}
            />
            Port
          </li>
          {data.disruptedGeoJSON.features.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full border-2"
                style={{ borderColor: colors.warn }}
              />
              Disrupted port
            </li>
          )}
        </ul>
      )}
      {tonesPresent.length > 0 && (
        <figcaption className="mt-2 text-xs text-muted">{ILLUSTRATIVE_ROUTE_NOTE}</figcaption>
      )}
    </figure>
  );
}
