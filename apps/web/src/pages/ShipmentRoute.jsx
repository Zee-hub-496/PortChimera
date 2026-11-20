import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api.js';
import { pickPathStops, projectPorts, toPolylinePoints } from '../lib/mapProjection.js';
import { formatRoute, ILLUSTRATIVE_NOTICE, OBJECTIVE_LABELS } from '../lib/routeView.js';

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

  if (notFound) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <h1 className="text-2xl font-bold">Shipment not found</h1>
        <Link to="/shipments" className="text-sky-400 underline">
          Back to shipments
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <Link to="/shipments" className="text-sm text-sky-400 underline">
          Back to shipments
        </Link>
        <h1 className="text-3xl font-bold">
          {shipment ? `Shipment ${shipment.shipmentNumber}` : 'Shipment'}
        </h1>
        {shipment && (
          <p className="text-slate-300">
            {shipment.origin?.name} to {shipment.destination?.name}
          </p>
        )}
        <Link to={`/shipments/${id}/documents`} className="text-sm text-sky-400 underline">
          Documents
        </Link>
        <Link to={`/shipments/${id}/cross-check`} className="text-sm text-sky-400 underline">
          Cross-check documents
        </Link>
        <p className="rounded bg-amber-900/40 p-2 text-sm text-amber-200">{ILLUSTRATIVE_NOTICE}</p>

        <label className="flex flex-col gap-1 text-sm">
          Optimize for
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="rounded bg-slate-800 p-2 text-slate-100"
          >
            {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {busy && <p className="text-slate-400">Calculating route...</p>}

        {view && !busy && (
          <section className="flex flex-col gap-4">
            {!view.found && <p className="text-slate-300">{view.message}</p>}
            {view.found && (
              <>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded bg-slate-900 p-3">
                    <dt className="text-xs text-slate-400">Transit time</dt>
                    <dd className="font-semibold">{view.days}</dd>
                  </div>
                  <div className="rounded bg-slate-900 p-3">
                    <dt className="text-xs text-slate-400">Freight cost</dt>
                    <dd className="font-semibold">{view.cost}</dd>
                  </div>
                  <div className="rounded bg-slate-900 p-3">
                    <dt className="text-xs text-slate-400">Risk</dt>
                    <dd className="font-semibold">{view.risk}</dd>
                  </div>
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
                  className="w-full rounded bg-slate-900"
                >
                  {projected.map((p) => (
                    <circle key={p.code} cx={p.x} cy={p.y} r="3" fill="#475569" />
                  ))}
                  <polyline
                    points={toPolylinePoints(stops)}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                  />
                  {stops.map((p) => (
                    <g key={p.code}>
                      <circle cx={p.x} cy={p.y} r="5" fill="#38bdf8" />
                      <text x={p.x + 7} y={p.y - 7} fontSize="11" fill="#e2e8f0">
                        {p.name}
                      </text>
                    </g>
                  ))}
                </svg>
              </>
            )}
            {view.notice && <p className="text-xs text-slate-400">{view.notice}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
