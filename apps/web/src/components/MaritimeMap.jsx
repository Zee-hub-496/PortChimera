import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import worldData from '../assets/world-110m.json';
import { CHOKEPOINTS, chokepointsOnPath } from '../lib/chokepoints.js';
import {
  ILLUSTRATIVE_ROUTE_NOTE,
  MAP_ATTRIBUTION,
  boundsOf,
  disruptedToGeoJSON,
  portsToGeoJSON,
  progressiveLine,
  routesToGeoJSON,
  splitAtDateLine,
  toLatLngs,
} from '../lib/mapData.js';
import { useTheme } from './ThemeProvider.jsx';

// [[south, west], [north, east]] in Leaflet order. The map never pans outside this box, so the
// world is drawn once and pins never repeat.
const MAX_BOUNDS = [
  [-60, -180],
  [84, 180],
];
const MAX_ZOOM = 7;
const DRAW_MS = 2200;
const LABEL_MIN_ZOOM = 3;
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
    land: '#f6f3ea',
    border: '#cfc8b6',
    graticule: '#7aa0b8',
  },
  dark: {
    primary: '#22d3ee',
    alternative: '#a78bfa',
    blocked: '#f87171',
    port: '#e8eef7',
    highlight: '#22d3ee',
    warn: '#fbbf24',
    land: '#1b2b44',
    border: '#2f4467',
    graticule: '#5b7aa3',
  },
};

const TONE_LABELS = {
  primary: 'Planned route',
  alternative: 'Alternative route',
  blocked: 'Blocked',
};

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Content is built with textContent only, never from an HTML string.
function defaultPopup(port) {
  const root = el('div');
  root.append(
    el('div', 'pc-pop-title', port.name),
    el('div', 'pc-pop-code', port.country ? `${port.code} · ${port.country}` : port.code),
  );
  return root;
}

function chokepointContent(point, onRoute) {
  const root = el('div');
  root.append(el('div', 'pc-pop-title', point.name), el('div', 'pc-pop-note', point.note));
  if (onRoute) root.append(el('div', 'pc-pop-flag', 'On the drawn route'));
  return root;
}

function toNode(content) {
  if (typeof content !== 'string') return content;
  return el('div', '', content);
}

function pinIcon(highlight) {
  const size = highlight ? 22 : 16;
  return L.divIcon({
    html: el('div', highlight ? 'pc-pin pc-pin-hi' : 'pc-pin'),
    className: 'pc-pin-wrap',
    iconSize: [size, size],
  });
}

function chokeIcon(onRoute) {
  return L.divIcon({
    html: el('div', onRoute ? 'pc-choke pc-choke-on' : 'pc-choke'),
    className: 'pc-choke-wrap',
    iconSize: [18, 18],
  });
}

function disruptedIcon(pulse) {
  const ring = el('div', 'pc-disrupted');
  if (pulse) ring.append(el('span', 'pc-pulse'));
  return L.divIcon({ html: ring, className: 'pc-disrupted-wrap', iconSize: [30, 30] });
}

// Longitude in [-180, 180). Routes that cross the date line carry longitudes beyond 180.
const wrapLon = (lon) => lon - 360 * Math.floor((lon + 180) / 360);

// Fits the route, the ports or the world. Does nothing while the container has no size.
function fitMap(map, data, fit, animate) {
  const size = map.getSize();
  if (!size.x || !size.y) return false;
  let bounds = MAX_BOUNDS;
  let maxZoom = 5;
  if (fit === 'route' || fit === 'ports') {
    const coords =
      fit === 'route' ? data.routesGeoJSON.features.flatMap((f) => f.geometry.coordinates) : [];
    const pts = (coords.length ? coords : data.portPoints).map(([lon, lat]) => [wrapLon(lon), lat]);
    const b = boundsOf(pts);
    if (b) {
      bounds = [
        [b[0][1], b[0][0]],
        [b[1][1], b[1][0]],
      ];
      if (fit === 'ports') maxZoom = 4;
    }
  }
  map.fitBounds(bounds, { padding: [44, 44], maxZoom, animate, duration: 0.6 });
  return true;
}

/**
 * Interactive Leaflet map with a self-hosted vector basemap (Natural Earth 1:110m, public domain),
 * port pins, hand-drawn sea-lane routes and maritime chokepoints. It loads no tiles and needs no
 * API key, web worker or WebGL. The basemap follows the app theme. Falls back to a text list if
 * Leaflet or the bundled basemap cannot be drawn. The map only draws what it is given and never
 * computes routes. Sea lanes are illustrative, not navigational.
 *
 * Props contract (stable, the crisis rerouting screen only needs `routes` and `disruptedCodes`):
 * - ports: Array<{code, name, country?, lat, lon}>  port pins. Defaults to route stops with a code.
 * - routes: Array<{id, stops: Array<{code?, name?, lat, lon}>, tone, label}>
 *     tone 'primary' (solid), 'alternative' (solid, second colour), 'blocked' (red, dashed).
 *     A leg between two seeded ports follows its sea lane, any other leg is a great-circle arc.
 * - route: Array<stop>  shorthand for one primary route. Ignored when `routes` is given.
 * - disruptedCodes: string[]  port codes drawn with a warning ring and a pulsing marker.
 * - highlightCodes: string[]  port codes drawn larger in the accent colour, always labelled.
 * - selectedCode: string  highlights that port, flies to it and opens its popup.
 * - animateRoute: boolean  draw non-blocked routes progressively with a moving dot.
 *     Skipped when the user prefers reduced motion.
 * - showChokepoints: boolean (default true)  diamond markers for major chokepoints. Those on a
 *     drawn route are highlighted and named under the map.
 * - onPortClick: (port) => void
 * - popupRender: (port) => HTMLElement | string  replaces the default popup (name and mono code).
 * - height: number | string (default 360), interactive: boolean (default true)
 * - fit: 'route' | 'ports' | 'world', legend: boolean (default true), className, ariaLabel
 *     'route' frames the routes (or the ports without routes), 'ports' frames the ports.
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
  showChokepoints = true,
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
  const [failed, setFailed] = useState(false);

  const routeList =
    routes ?? (route.length >= 2 ? [{ id: 'route', stops: route, tone: 'primary' }] : []);
  const stops = routeList.flatMap((r) => r.stops ?? []);
  const portList = ports.length ? ports : stops.filter((s) => s.code);
  const highlights = selectedCode ? [...highlightCodes, selectedCode] : highlightCodes;
  const routesGeoJSON = routesToGeoJSON(routeList);
  const onRoute = showChokepoints
    ? chokepointsOnPath(routesGeoJSON.features.flatMap((f) => f.geometry.coordinates))
    : [];
  const data = {
    portsGeoJSON: portsToGeoJSON(portList, { highlightCodes: highlights }),
    routesGeoJSON,
    disruptedGeoJSON: disruptedToGeoJSON(portList, disruptedCodes),
    portPoints: portList.map((p) => [p.lon, p.lat]),
    onRouteIds: onRoute.map((c) => c.id),
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
    showChokepoints,
  };
  const renderedKey = useRef('');

  function showPopup(port) {
    const map = mapRef.current;
    if (!map) return;
    const content = live.current.popupRender?.(port) ?? defaultPopup(port);
    L.popup({ offset: [0, -6], closeButton: true })
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
    let land;
    const graticule = [];
    try {
      map = L.map(container, {
        center: [20, 10],
        zoom: 2,
        zoomSnap: 0.25,
        zoomControl: interactive,
        attributionControl: true,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        scrollWheelZoom: false,
        worldCopyJump: false,
        minZoom: 1,
        maxZoom: MAX_ZOOM,
        maxBounds: MAX_BOUNDS,
        maxBoundsViscosity: 1,
        renderer: L.canvas({ padding: 0.5 }),
      });
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution(MAP_ATTRIBUTION);
      // Light lat and lon lines first, then land and borders, so routes always draw on top.
      for (let lat = -60; lat <= 60; lat += 30) {
        graticule.push(
          L.polyline(
            [
              [lat, -180],
              [lat, 180],
            ],
            { weight: 1, interactive: false },
          ).addTo(map),
        );
      }
      for (let lon = -150; lon <= 150; lon += 30) {
        graticule.push(
          L.polyline(
            [
              [-60, lon],
              [84, lon],
            ],
            { weight: 1, interactive: false },
          ).addTo(map),
        );
      }
      land = L.geoJSON(worldData, { interactive: false, smoothFactor: 0.4 }).addTo(map);
    } catch {
      map?.remove();
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    container.classList.add('pc-map');

    const reduce = prefersReducedMotion();
    const groups = {
      routes: L.layerGroup().addTo(map),
      disrupted: L.layerGroup().addTo(map),
      chokepoints: L.layerGroup().addTo(map),
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

    // The smallest zoom shows the whole world filling the container, so it never repeats.
    function updateMinZoom() {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      map.setMinZoom(Math.min(map.getBoundsZoom(MAX_BOUNDS, true), MAX_ZOOM));
    }

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
        const latlngs = splitAtDateLine(part.coordinates).map(toLatLngs);
        entry.layers.forEach((layer) => layer.setLatLngs(latlngs));
        if (i === 0) tip = part.tip;
      });
      if (anim.dot) {
        if (tip && t < 1) {
          anim.dot.setLatLng([tip[1], wrapLon(tip[0])]);
          if (!groups.dot.hasLayer(anim.dot)) anim.dot.addTo(groups.dot);
        } else {
          groups.dot.clearLayers();
        }
      }
      anim.frame = t < 1 ? requestAnimationFrame(tick) : 0;
    }

    // Basemap colours follow the theme. The sea is the container background (CSS).
    function applyBase(c) {
      land.setStyle({
        color: c.border,
        weight: 0.7,
        fillColor: c.land,
        fillOpacity: 1,
        lineJoin: 'round',
      });
      graticule.forEach((line) => line.setStyle({ color: c.graticule, opacity: 0.22 }));
    }

    // Rebuilds every overlay layer from the current props. Safe to call repeatedly.
    function render() {
      const { data: d, theme, animateRoute: draw } = live.current;
      const c = PALETTE[theme] ?? PALETTE.light;
      applyBase(c);
      cancelAnimationFrame(anim.frame);
      anim.frame = 0;
      anim.lines = [];
      anim.dot = null;
      Object.values(groups).forEach((g) => g.clearLayers());

      const animate = draw && !reduce;
      d.routesGeoJSON.features.forEach((f) => {
        const blocked = f.properties.tone === 'blocked';
        const color = c[f.properties.tone] ?? c.primary;
        const coords = f.geometry.coordinates;
        const start = animate && !blocked ? progressiveLine(coords, 0).coordinates : coords;
        const latlngs = splitAtDateLine(start).map(toLatLngs);
        const glow = L.polyline(latlngs, {
          color,
          weight: 8,
          opacity: 0.16,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(groups.routes);
        const line = L.polyline(latlngs, {
          color,
          weight: blocked ? 2.5 : 3,
          opacity: 1,
          lineCap: blocked ? 'butt' : 'round',
          lineJoin: 'round',
          dashArray: blocked ? '6 8' : undefined,
          interactive: false,
        }).addTo(groups.routes);
        if (animate && !blocked) anim.lines.push({ layers: [glow, line], coords });
      });

      d.disruptedGeoJSON.features.forEach((f) => {
        const [lon, lat] = f.geometry.coordinates;
        L.marker([lat, lon], {
          icon: disruptedIcon(!reduce),
          interactive: false,
          keyboard: false,
        }).addTo(groups.disrupted);
      });

      if (live.current.showChokepoints) {
        const onRoute = new Set(d.onRouteIds);
        CHOKEPOINTS.forEach((point) => {
          const active = onRoute.has(point.id);
          const marker = L.marker([point.lat, point.lon], {
            icon: chokeIcon(active),
            title: point.name,
            alt: point.name,
            zIndexOffset: active ? 200 : 0,
          });
          marker.bindTooltip(chokepointContent(point, active), {
            direction: 'top',
            offset: [0, -8],
            className: 'pc-choke-tip',
          });
          marker.on('click', () => {
            L.popup({ offset: [0, -6], closeButton: true })
              .setLatLng([point.lat, point.lon])
              .setContent(chokepointContent(point, active))
              .openOn(map);
          });
          marker.addTo(groups.chokepoints);
        });
      }

      d.portsGeoJSON.features.forEach((f) => {
        const { code, name, highlight } = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        const marker = L.marker([lat, lon], {
          icon: pinIcon(highlight),
          title: live.current.ports.length > MANY_PORTS ? name : undefined,
          riseOnHover: true,
          zIndexOffset: highlight ? 400 : 300,
        });
        marker.bindTooltip(el('span', '', name), {
          permanent: true,
          direction: 'bottom',
          offset: [0, highlight ? 9 : 6],
          className: highlight ? 'pc-port-label pc-port-label-hi' : 'pc-port-label',
        });
        marker.on('click', () => {
          const port = live.current.ports.find((p) => p.code === code);
          if (!port) return;
          live.current.onPortClick?.(port);
          showPopupRef.current(port);
        });
        marker.addTo(groups.ports);
      });

      if (animate && anim.lines.length) {
        anim.dot = L.circleMarker([0, 0], {
          radius: 5.5,
          color: '#ffffff',
          weight: 2.5,
          fillColor: c.primary,
          fillOpacity: 1,
          interactive: false,
        });
        anim.start = performance.now();
        anim.frame = requestAnimationFrame(tick);
      }
      toggleLabels();
    }

    // The first fit needs a container with a size, so it may wait for the ResizeObserver.
    let fitted = false;
    function firstFit() {
      if (fitted) return;
      updateMinZoom();
      if (!fitMap(map, live.current.data, live.current.fit, false)) return;
      fitted = true;
      const first = live.current.ports.find((p) => p.code === live.current.selectedCode);
      if (first) {
        map.setView([first.lat, first.lon], 4, { animate: false });
        showPopupRef.current(first);
      }
    }
    live.current.render = render;
    try {
      render();
    } catch {
      map.remove();
      mapRef.current = null;
      setFailed(true);
      return undefined;
    }
    renderedKey.current = live.current.key;
    firstFit();

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      updateMinZoom();
      firstFit();
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(anim.frame);
      observer.disconnect();
      container.removeEventListener('mouseleave', onMouseLeave);
      live.current.render = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Redraw the layers when ports, routes, markers or the theme change. Refit only for new geometry.
  const geometrySignature = JSON.stringify([
    portList.map((p) => p.code),
    routeList.map((r) => [r.id, r.tone, (r.stops ?? []).map((s) => [s.lat, s.lon])]),
    disruptedCodes,
    fit,
  ]);
  const key = JSON.stringify([
    geometrySignature,
    highlights,
    resolved,
    animateRoute,
    showChokepoints,
  ]);
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

  const tonesPresent = [...new Set(routesGeoJSON.features.map((f) => f.properties.tone))];
  const showLegend =
    legend &&
    (tonesPresent.length > 0 || data.disruptedGeoJSON.features.length > 0 || showChokepoints);
  const colors = PALETTE[resolved] ?? PALETTE.light;

  const listing = stops.length ? stops : portList;

  return (
    <figure className={`m-0 ${className}`}>
      <div
        className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-card"
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
              Your browser could not draw the map. Stops are listed instead.
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
                className="inline-block h-0.5 w-5 rounded"
                style={{
                  background:
                    tone === 'blocked'
                      ? `repeating-linear-gradient(90deg, ${colors.blocked} 0 5px, transparent 5px 8px)`
                      : colors[tone],
                }}
              />
              {TONE_LABELS[tone]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full border-2 border-surface"
              style={{ background: colors.port, boxShadow: '0 0 0 1px var(--line)' }}
            />
            Port
          </li>
          {showChokepoints && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rotate-45 border-2"
                style={{ borderColor: colors.warn }}
              />
              Chokepoint
            </li>
          )}
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
      {(tonesPresent.length > 0 || onRoute.length > 0) && (
        <figcaption className="mt-2 space-y-1 text-xs text-muted">
          {onRoute.length > 0 && (
            <p>
              <span className="font-semibold text-fg">Chokepoints on this route:</span>{' '}
              {onRoute.map((c) => c.name).join(', ')}.
            </p>
          )}
          {tonesPresent.length > 0 && <p>{ILLUSTRATIVE_ROUTE_NOTE}</p>}
        </figcaption>
      )}
    </figure>
  );
}
