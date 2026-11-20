import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ILLUSTRATIVE_ROUTE_NOTE,
  boundsOf,
  portsToGeoJSON,
  routeToGeoJSON,
  styleFor,
} from '../lib/mapData.js';
import { useTheme } from './ThemeProvider.jsx';

const PORTS_SOURCE = 'pc-ports';
const ROUTE_SOURCE = 'pc-route';
const WORLD_BOUNDS = [
  [-130, -40],
  [170, 65],
];

// Layer colours cannot use CSS variables, so each theme has its own set.
const PALETTE = {
  light: {
    route: '#0e7490',
    port: '#0b1f3a',
    highlight: '#0e7490',
    ring: '#ffffff',
    text: '#0b1f3a',
    halo: '#ffffff',
  },
  dark: {
    route: '#22d3ee',
    port: '#e8eef7',
    highlight: '#22d3ee',
    ring: '#0a1220',
    text: '#e8eef7',
    halo: '#0a1220',
  },
};

const FONT_STACK = ['Montserrat Regular', 'Open Sans Regular', 'Noto Sans Regular'];

function addOverlay(map, data, theme) {
  const c = PALETTE[theme] ?? PALETTE.light;
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: data.routeGeoJSON });
  }
  if (!map.getSource(PORTS_SOURCE)) {
    map.addSource(PORTS_SOURCE, { type: 'geojson', data: data.portsGeoJSON });
  }
  if (!map.getLayer('pc-route-casing')) {
    map.addLayer({
      id: 'pc-route-casing',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.route, 'line-width': 6, 'line-opacity': 0.15 },
    });
    map.addLayer({
      id: 'pc-route-line',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': c.route, 'line-width': 2.5, 'line-dasharray': [2, 2] },
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
    map.addLayer({
      id: 'pc-ports-label',
      type: 'symbol',
      source: PORTS_SOURCE,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_STACK,
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    });
  }
}

function fitMap(map, data, fit, animate) {
  let bounds = WORLD_BOUNDS;
  if (fit === 'route') {
    const coords = data.routeGeoJSON.geometry.coordinates;
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
 * Interactive map with CARTO basemap, port pins and an illustrative route arc.
 * Basemap switches with the theme. Falls back to a text list if WebGL or the style fails.
 * @param {{
 *   ports?: Array<{code: string, name: string, country?: string, lat: number, lon: number}>,
 *   route?: Array<{code?: string, name?: string, lat: number, lon: number}>,
 *   highlightCodes?: string[],
 *   onPortClick?: (port: object) => void,
 *   popupRender?: (port: object) => HTMLElement|string,
 *   height?: number|string,
 *   interactive?: boolean,
 *   className?: string,
 *   ariaLabel?: string,
 *   fit?: 'route'|'world',
 * }} props
 */
export default function MaritimeMap({
  ports = [],
  route = [],
  highlightCodes = [],
  onPortClick,
  popupRender,
  height = 360,
  interactive = true,
  className = '',
  ariaLabel = 'Map of ports and shipping route',
  fit = 'route',
}) {
  const { resolved } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const [failed, setFailed] = useState(false);

  // Latest props for event handlers that were registered once.
  const stops = route.length >= 2 ? route : [];
  const portList = ports.length ? ports : route.filter((s) => s.code);
  const data = {
    portsGeoJSON: portsToGeoJSON(portList, { highlightCodes }),
    routeGeoJSON: stops.length
      ? routeToGeoJSON(stops)
      : { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    portPoints: portList.map((p) => [p.lon, p.lat]),
  };
  const live = useRef({});
  live.current = { data, fit, theme: resolved, ports: portList, onPortClick, popupRender };

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

    let frame = 0;
    let timer = 0;
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Marching dashes on the route line. Skipped when the user prefers reduced motion.
    const frames = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
      [0, 0.5, 3, 3.5],
      [0, 1, 3, 3],
      [0, 1.5, 3, 2.5],
      [0, 2, 3, 2],
      [0, 2.5, 3, 1.5],
      [0, 3, 3, 1],
      [0, 3.5, 3, 0.5],
    ];
    function animate() {
      if (map.getLayer('pc-route-line')) {
        map.setPaintProperty('pc-route-line', 'line-dasharray', frames[frame % frames.length]);
      }
      frame += 1;
      timer = window.setTimeout(animate, 90);
    }

    const onStyleLoad = () => {
      const { data: d, theme } = live.current;
      addOverlay(map, d, theme);
      if (!readyRef.current) {
        readyRef.current = true;
        fitMap(map, d, live.current.fit, false);
        if (!reduce && d.routeGeoJSON.geometry.coordinates.length) animate();
      }
    };
    map.on('style.load', onStyleLoad);

    map.on('click', 'pc-ports-circle', (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const code = feature.properties.code;
      const port = live.current.ports.find((p) => p.code === code);
      if (!port) return;
      live.current.onPortClick?.(port);
      const content = live.current.popupRender?.(port) ?? defaultPopup(port);
      const popup = new maplibregl.Popup({ offset: 12, closeButton: true });
      if (typeof content === 'string') popup.setText(content);
      else popup.setDOMContent(content);
      popup.setLngLat(feature.geometry.coordinates).addTo(map);
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
      window.clearTimeout(timer);
      observer.disconnect();
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

  // Push new ports or route into the sources and refit.
  const signature = JSON.stringify([
    portList.map((p) => p.code),
    stops.map((s) => [s.lat, s.lon]),
    highlightCodes,
    fit,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.getSource(PORTS_SOURCE)?.setData(live.current.data.portsGeoJSON);
    map.getSource(ROUTE_SOURCE)?.setData(live.current.data.routeGeoJSON);
    fitMap(map, live.current.data, live.current.fit, true);
  }, [signature]);

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
      {stops.length > 0 && (
        <figcaption className="mt-2 text-xs text-muted">{ILLUSTRATIVE_ROUTE_NOTE}</figcaption>
      )}
    </figure>
  );
}
