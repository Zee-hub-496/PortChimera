import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api.js';
import { pickPathStops, projectPorts, toPolylinePoints } from '../lib/mapProjection.js';
import { formatRoute, ILLUSTRATIVE_NOTICE, OBJECTIVE_LABELS } from '../lib/routeView.js';
import { Card, ErrorState, PageHeader, Skeleton } from '../components/ui.jsx';

const VIEW = { width: 600, height: 300 };

export default function ShipmentRoute() {
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [ports, setPorts] = useState([]);
  const [objective, setObjective] = useState('fastest');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([apiGet(`/api/shipments/${id}`), apiGet('/api/ports')])
      .then(([s, p]) => {
        setShipment(s);
        setPorts(p);
      })
      .catch((err) => (err.status === 404 ? setNotFound(true) : setError(err.message)));
  }, [id]);

  useEffect(() => {
    if (!shipment) return;
    let ignore = false; // a slower, older response must not overwrite the latest objective
    setBusy(true);
    setError('');
    apiPost('/api/routes/calculate', { shipmentId: id, objective })
      .then((r) => !ignore && setResult(r))
      .catch((err) => !ignore && setError(err.message))
      .finally(() => !ignore && setBusy(false));
    return () => {
      ignore = true;
    };
  }, [shipment, id, objective]);

  const projected = useMemo(() => projectPorts(ports, VIEW), [ports]);
  const stops = useMemo(() => pickPathStops(projected, result?.path ?? []), [projected, result]);
  const view = result ? formatRoute(result) : null;

  // The shipment layout already shows the not-found state.
  if (notFound) return null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Route" description="An illustrative route between the two ports." />
      <p className="rounded-lg bg-warn-soft p-2 text-sm text-warn">{ILLUSTRATIVE_NOTICE}</p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Optimize for
        <select
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          className="rounded-lg border border-line bg-surface-2 p-2 text-fg"
        >
          {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {error && <ErrorState message={error} />}
      {busy && <Skeleton className="h-40" />}

      {view && !busy && (
        <section className="flex flex-col gap-4">
          {!view.found && <p className="text-muted">{view.message}</p>}
          {view.found && (
            <>
              <dl className="grid grid-cols-3 gap-3 text-center">
                <Card className="p-3">
                  <dt className="text-xs text-muted">Transit time</dt>
                  <dd className="font-mono font-semibold">{view.days}</dd>
                </Card>
                <Card className="p-3">
                  <dt className="text-xs text-muted">Freight cost</dt>
                  <dd className="font-mono font-semibold">{view.cost}</dd>
                </Card>
                <Card className="p-3">
                  <dt className="text-xs text-muted">Risk</dt>
                  <dd className="font-mono font-semibold">{view.risk}</dd>
                </Card>
              </dl>
              <ol className="list-decimal pl-6">
                {view.stops.map((stop) => (
                  <li key={stop}>{stop}</li>
                ))}
              </ol>
              <svg
                viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
                role="img"
                aria-label="Sketch of the route on a plain longitude and latitude map"
                className="w-full rounded-xl border border-line bg-surface"
              >
                {projected.map((p) => (
                  <circle key={p.code} cx={p.x} cy={p.y} r="3" className="fill-muted" />
                ))}
                <polyline
                  points={toPolylinePoints(stops)}
                  fill="none"
                  strokeWidth="2"
                  className="stroke-accent"
                />
                {stops.map((p) => (
                  <g key={p.code}>
                    <circle cx={p.x} cy={p.y} r="5" className="fill-accent" />
                    <text x={p.x + 7} y={p.y - 7} fontSize="11" className="fill-fg">
                      {p.name}
                    </text>
                  </g>
                ))}
              </svg>
            </>
          )}
          {view.notice && <p className="text-xs text-muted">{view.notice}</p>}
        </section>
      )}
    </div>
  );
}
