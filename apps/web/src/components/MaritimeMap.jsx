import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ILLUSTRATIVE_ROUTE_NOTE,
  boundsOf,
  disruptedToGeoJSON,
  portsToGeoJSON,
  progressiveLine,
  routesToGeoJSON,
  styleFor,
} from '../lib/mapData.js';
import { useTheme } from './ThemeProvider.jsx';

const PORTS_SOURCE = 'pc-ports';
const ROUTES_SOURCE = 'pc-routes';
const DISRUPTED_SOURCE = 'pc-disrupted';
const DOT_SOURCE = 'pc-dot';
const WORLD_BOUNDS = [
  [-130, -40],
  [170, 65],
];
const DRAW_MS = 2200;

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
    text: '#0b1f3a',
    halo: '#ffffff',
  },
  dark: {
    primary: '#22d3ee',
    alternative: '#a78bfa',
    blocked: '#f87171',
    port: '#e8eef7',
    highlight: '#22d3ee',
    warn: '#fbbf24',
    ring: '#0a1220',
    text: '#e8eef7',
    halo: '#0a1220',
  },
};

const TONE_LABELS = {
  primary: 'Planned route',
  alternative: 'Alternative route',
  blocked: 'Blocked',
};

const EMPTY = { type: 'FeatureCollection', features: [] };

// Reuse a font stack that the loaded CARTO style already uses, so glyphs exist.
// Returns undefined when none is found, and the label layer then omits text-font.
function fontFromStyle(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) {
    const font = l.type === 'symbol' ? l.layout?.['text-font'] : undefined;
    if (Array.isArray(font) && font.length && font.every((f) => typeof f === 'string')) return font;
  }
  return undefined;
}

function toneColor(c) {
  return ['match', ['get', 'tone'], 'alternative', c.alternative, 'blocked', c.blocked, c.primary];
}

function addOverlay(map, theme) {
  const c = PALETTE[theme] ?? PALETTE.light;
  for (const id of [ROUTES_SOURCE, PORTS_SOURCE, DISRUPTED_SOURCE, DOT_SOURCE]) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  }
  if (!map.getLayer('pc-routes-casing')) {
    map.addLayer({
      id: 'pc-routes-casing',
      type: 'line',
      source: ROUTES_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': toneColor(c), 'line-width': 7, 'line-opacity': 0.14 },
    });
    map.addLayer({
      id: 'pc-routes-solid',
      type: 'line',
      source: ROUTES_SOURCE,
      filter: ['!=', ['get', 'tone'], 'blocked'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': toneColor(c), 'line-width': 2.75 },
    });
    map.addLayer({
      id: 'pc-routes-blocked',
      type: 'line',
      source: ROUTES_SOURCE,
      filter: ['==', ['get', 'tone'], 'blocked'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': c.blocked, 'line-width': 2.5, 'line-dasharray': [1.5, 2] },
    });
  }
  if (!map.getLayer('pc-disrupted-pulse')) {
    map.addLayer({
      id: 'pc-disrupted-pulse',
      type: 'circle',
      source: DISRUPTED_SOURCE,
      paint: { 'circle-radius': 12, 'circle-color': c.warn, 'circle-opacity': 0.25 },
    });
    map.addLayer({
      id: 'pc-disrupted-ring',
      type: 'circle',
      source: DISRUPTED_SOURCE,
      paint: {
        'circle-radius': 11,
        'circle-color': c.warn,
        'circle-opacity': 0,
        'circle-stroke-color': c.warn,
        'circle-stroke-width': 2.5,
      },
    });
  }
  if (!map.getLayer('pc-ports-circle')) {
    map.addLayer({
      id: 'pc-ports-circle',
      type: 'circle',
      source: PORTS_SOURCE,
      paint: {
        'circle-radius': ['case', ['get', 'highlight'], 8, 5.5],
        'circle-color': ['case', ['get', 'highlight'], c.highlight, c.port],
        'circle-stroke-color': c.ring,
        'circle-stroke-width': 2,
      },
    });
    const font = fontFromStyle(map);
    map.addLayer({
      id: 'pc-ports-label',
      type: 'symbol',
      source: PORTS_SOURCE,
      layout: {
        'text-field': ['get', 'name'],
        ...(font ? { 'text-font': font } : {}),
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    });
  }
  if (!map.getLayer('pc-dot')) {
    map.addLayer({
      id: 'pc-dot',
      type: 'circle',
      source: DOT_SOURCE,
      paint: {
        'circle-radius': 5,
        'circle-color': c.primary,
        'circle-stroke-color': c.ring,
        'circle-stroke-width': 2,
      },
    });
  }
}

function fitMap(map, data, fit, animate) {
  let bounds = WORLD_BOUNDS;
  if (fit === 'route') {
    const coords = data.routesGeoJSON.features.flatMap((f) => f.geometry.coordinates);
    bounds = boundsOf(coords.length ? coords : data.portPoints) ?? WORLD_BOUNDS;
  }
  map.fitBounds(bounds, { padding: 40, maxZoom: 5, animate, duration: 600 });
}

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

/**
 * Interactive map with a CARTO basemap, port pins and curved (great-circle) route arcs.
 * The basemap follows the app theme. Falls back to a text list if WebGL or the style fails.
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
  const popupRef = useRef(null);
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
  const animRef = useRef({ frame: 0, start: 0 });

  function showPopup(port) {
    const map = mapRef.current;
    if (!map) return;
    popupRef.current?.remove();
    const content = live.current.popupRender?.(port) ?? defaultPopup(port);
    const popup = new maplibregl.Popup({ offset: 12, closeButton: true });
    if (typeof content === 'string') popup.setText(content);
    else popup.setDOMContent(content);
    popup.setLngLat([port.lon, port.lat]).addTo(map);
    popupRef.current = popup;
  }
  const showPopupRef = useRef(showPopup);
  showPopupRef.current = showPopup;

  // Create the map once.
  useEffect(() => {
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: styleFor(live.current.theme),
        center: [60, 20],
        zoom: 1.2,
        interactive,
        cooperativeGestures: interactive,
        attributionControl: false,
        dragRotate: false,
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }

    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = animRef.current;

    // One requestAnimationFrame loop: progressive route drawing, moving dot, pulsing warning rings.
    function tick(now) {
      const { data: d, animateRoute: draw } = live.current;
      let busy = false;
      const drawing = draw && !reduce && d.routesGeoJSON.features.length > 0;
      if (drawing) {
        const t = Math.min(1, (now - anim.start) / DRAW_MS);
        const features = d.routesGeoJSON.features.map((f) =>
          f.properties.tone === 'blocked'
            ? f
            : {
                ...f,
                geometry: {
                  ...f.geometry,
                  coordinates: progressiveLine(f.geometry.coordinates, t).coordinates,
                },
              },
        );
        map.getSource(ROUTES_SOURCE)?.setData({ type: 'FeatureCollection', features });
        const lead = d.routesGeoJSON.features.find((f) => f.properties.tone !== 'blocked');
        const tip = lead ? progressiveLine(lead.geometry.coordinates, t).tip : null;
        map
          .getSource(DOT_SOURCE)
          ?.setData(
            tip && t < 1
              ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: tip } }
              : EMPTY,
          );
        if (t < 1) busy = true;
      }
      if (!reduce && d.disruptedGeoJSON.features.length && map.getLayer('pc-disrupted-pulse')) {
        const phase = (now % 1600) / 1600;
        map.setPaintProperty('pc-disrupted-pulse', 'circle-radius', 11 + phase * 14);
        map.setPaintProperty('pc-disrupted-pulse', 'circle-opacity', 0.35 * (1 - phase));
        busy = true;
      }
      anim.frame = busy ? requestAnimationFrame(tick) : 0;
    }

    // Pushes the current data into the sources. Safe to call repeatedly.
    function render() {
      const { data: d, theme } = live.current;
      addOverlay(map, theme);
      map.getSource(PORTS_SOURCE)?.setData(d.portsGeoJSON);
      map.getSource(ROUTES_SOURCE)?.setData(d.routesGeoJSON);
      map.getSource(DISRUPTED_SOURCE)?.setData(d.disruptedGeoJSON);
      map.getSource(DOT_SOURCE)?.setData(EMPTY);
      cancelAnimationFrame(anim.frame);
      anim.start = performance.now();
      anim.frame = requestAnimationFrame(tick);
    }
    live.current.render = render;

    map.on('style.load', () => {
      render();
      if (!readyRef.current) {
        readyRef.current = true;
        fitMap(map, live.current.data, live.current.fit, false);
        const first = live.current.ports.find((p) => p.code === live.current.selectedCode);
        if (first) {
          map.jumpTo({ center: [first.lon, first.lat], zoom: 3.5 });
          showPopupRef.current(first);
        }
      }
    });

    map.on('click', 'pc-ports-circle', (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const port = live.current.ports.find((p) => p.code === feature.properties.code);
      if (!port) return;
      live.current.onPortClick?.(port);
      showPopupRef.current(port);
    });
    map.on('mouseenter', 'pc-ports-circle', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'pc-ports-circle', () => {
      map.getCanvas().style.cursor = '';
    });

    // An error before the first style load means tiles or style could not be fetched.
    map.on('error', () => {
      if (!readyRef.current) setFailed(true);
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(anim.frame);
      observer.disconnect();
      popupRef.current?.remove();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Switch basemap with the theme. The overlay is re-added in the style.load handler.
  const lastTheme = useRef(resolved);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lastTheme.current === resolved) return;
    lastTheme.current = resolved;
    map.setStyle(styleFor(resolved));
  }, [resolved]);

  // Push new ports, routes or markers into the sources and refit.
  const geometrySignature = JSON.stringify([
    portList.map((p) => p.code),
    routeList.map((r) => [r.id, r.tone, (r.stops ?? []).map((s) => [s.lat, s.lon])]),
    disruptedCodes,
    fit,
  ]);
  const signature = JSON.stringify([geometrySignature, highlights]);
  const lastGeometry = useRef(geometrySignature);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    live.current.render?.();
    // Highlight-only changes (a port selection) must not refit the view.
    if (lastGeometry.current !== geometrySignature) {
      lastGeometry.current = geometrySignature;
      fitMap(map, live.current.data, live.current.fit, true);
    }
  }, [signature]);

  // Fly to and open the selected port.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !selectedCode) return;
    const port = live.current.ports.find((p) => p.code === selectedCode);
    if (!port) return;
    map.flyTo({ center: [port.lon, port.lat], zoom: Math.max(map.getZoom(), 3.5), duration: 800 });
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
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0"
          hidden={failed}
        />
        {failed && (
          <div role="alert" className="absolute inset-0 overflow-auto p-4 text-sm">
            <p className="font-bold text-fg">The map could not be loaded.</p>
            <p className="mt-1 text-muted">
              This can happen without WebGL or when the map tiles are blocked. Stops are listed
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
