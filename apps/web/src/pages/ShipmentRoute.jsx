import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Clock, DollarSign, ShieldAlert } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { formatRoute, ILLUSTRATIVE_NOTICE, OBJECTIVE_LABELS } from '../lib/routeView.js';
import { indexNetwork, overlayFor } from '../lib/scenarioView.js';
import MaritimeMapLazy from '../components/MaritimeMapLazy.jsx';
import ScenarioPanel from '../components/ScenarioPanel.jsx';
import SimulationSummary from '../components/SimulationSummary.jsx';
import { Card, ErrorState, PageHeader, Skeleton } from '../components/ui.jsx';

const STAT_ICONS = { days: Clock, cost: DollarSign, risk: ShieldAlert };
const NO_SCENARIO = { simulation: null, effects: [], simulating: false };

// The API sends lat and lon for each stop. Fall back to the port list by code if one is missing.
function stopsWithCoordinates(path, ports) {
  const byCode = new Map(ports.map((p) => [p.code, p]));
  return path
    .map((s) => {
      const known = byCode.get(s.code);
      return {
        code: s.code,
        name: s.name,
        lat: s.lat ?? known?.lat,
        lon: s.lon ?? known?.lon,
      };
    })
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

export default function ShipmentRoute() {
  const { id } = useParams();
  const { shipment } = useOutletContext(); // loaded once by ShipmentLayout
  const [network, setNetwork] = useState(null);
  const [objective, setObjective] = useState('fastest');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Filled in by the scenario panel: the latest simulation and the closures behind it.
  const [scenario, setScenario] = useState(NO_SCENARIO);

  useEffect(() => {
    apiGet('/api/ports/network')
      .then(setNetwork)
      .catch((err) => setError(err.message));
  }, []);

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

  const ports = useMemo(() => network?.ports ?? [], [network]);
  const index = useMemo(() => indexNetwork(network), [network]);
  const stops = useMemo(() => stopsWithCoordinates(result?.path ?? [], ports), [result, ports]);
  const view = result ? formatRoute(result) : null;
  const overlay = useMemo(
    () => overlayFor(scenario.simulation, scenario.effects, index),
    [scenario, index],
  );
  const pathCodes = useMemo(() => (result?.path ?? []).map((p) => p.code), [result]);
  const simulating = scenario.simulation !== null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Route"
        description="An illustrative route between the two ports. Close a port or lane below to see how it would change."
      />
      <p className="rounded-lg bg-warn-soft p-2 text-sm text-warn">{ILLUSTRATIVE_NOTICE}</p>

      <div role="radiogroup" aria-label="Optimize for" className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Optimize for</span>
        <div className="inline-flex w-fit rounded-lg border border-line bg-surface-2 p-1">
          {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={objective === value}
              onClick={() => setObjective(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                objective === value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} />}
      {busy && <Skeleton className="h-40" />}

      {simulating && (
        <SimulationSummary simulation={scenario.simulation} stale={scenario.simulating} />
      )}

      {simulating && (
        <MaritimeMapLazy
          ports={overlay.ports}
          routes={overlay.routes}
          disruptedCodes={overlay.disruptedCodes}
          highlightCodes={overlay.endpoints}
          animateRoute
          height={380}
          fit="route"
          ariaLabel={`Map of the original route and, if it changed, the rerouted route. ${scenario.simulation.explanation}`}
        />
      )}

      {view && !busy && !simulating && (
        <section className="flex flex-col gap-4">
          {!view.found && <p className="text-muted">{view.message}</p>}
          {view.found && (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['days', 'Transit time', view.days],
                  ['cost', 'Freight cost', view.cost],
                  ['risk', 'Risk', view.risk],
                ].map(([key, label, value]) => {
                  const Icon = STAT_ICONS[key];
                  return (
                    <Card key={key} className="p-3">
                      <dt className="flex items-center gap-1.5 text-xs text-muted">
                        <Icon size={14} aria-hidden="true" />
                        {label}
                      </dt>
                      <dd className="mt-1 font-mono text-sm font-semibold">{value}</dd>
                    </Card>
                  );
                })}
              </dl>
              <MaritimeMapLazy
                ports={stops}
                routes={[{ id: 'path', stops, tone: 'primary', label: view.objective }]}
                highlightCodes={stops.length ? [stops[0].code, stops[stops.length - 1].code] : []}
                animateRoute
                height={380}
                fit="route"
                ariaLabel={`Map of the ${view.objective.toLowerCase()} route: ${view.pathLabel}`}
              />
              <ol aria-label="Stops" className="flex flex-col">
                {view.stops.map((stop, i) => (
                  <li key={stop} className="flex items-center gap-3 py-1.5 text-sm">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent"
                    >
                      {i + 1}
                    </span>
                    {stop}
                  </li>
                ))}
              </ol>
            </>
          )}
          {view.notice && <p className="text-xs text-muted">{view.notice}</p>}
        </section>
      )}

      {network && shipment && result?.status === 'found' && (
        <ScenarioPanel
          shipmentId={id}
          objective={objective}
          network={network}
          pathCodes={pathCodes}
          onResult={setScenario}
        />
      )}
    </div>
  );
}
