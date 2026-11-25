import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '../lib/api.js';
import {
  buildEffect,
  closedTargetIds,
  describeEffect,
  effectTypesFor,
  indexNetwork,
  nextScenarioName,
  TARGET_KINDS,
  targetOptions,
} from '../lib/scenarioView.js';
import { Badge, Button, Card, ErrorState, Spinner } from './ui.jsx';

const field =
  'rounded-lg border border-line bg-surface-2 p-2 text-fg placeholder:text-muted focus:border-accent';

/**
 * Crisis simulation controls: close a port or lane, reopen it, switch between saved scenarios and
 * go back to the original route. Every change re-runs the simulation on the server, and the
 * result is passed up through `onResult({ simulation, effects, simulating })` for the page to draw.
 *
 * `onResult` must be a stable function (a state setter is fine).
 */
export default function ScenarioPanel({ shipmentId, objective, network, pathCodes, onResult }) {
  const index = useMemo(() => indexNetwork(network), [network]);
  const [scenarios, setScenarios] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [currentId, setCurrentId] = useState(null);
  const [version, setVersion] = useState(0); // bumped after every change to re-run the simulation
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('port');
  const [targetId, setTargetId] = useState('');
  const [type, setType] = useState('port_strike');
  const ticket = useRef(0); // a slower, older answer must not replace the latest one

  const current = scenarios.find((s) => s.id === currentId) ?? null;
  const effects = useMemo(() => current?.effects ?? [], [current]);

  useEffect(() => {
    apiGet('/api/scenarios')
      .then(setScenarios)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingList(false));
  }, []);

  // Runs the simulation whenever the scenario, its effects or the objective change.
  const simulate = useCallback(
    async (scenarioId) => {
      const mine = (ticket.current += 1);
      setSimulating(true);
      setError('');
      try {
        const result = await apiPost(`/api/scenarios/${scenarioId}/simulate`, {
          shipmentId,
          objective,
        });
        if (mine === ticket.current) setSimulation(result);
      } catch (err) {
        if (mine === ticket.current) {
          setSimulation(null);
          setError(err.message);
        }
      } finally {
        if (mine === ticket.current) setSimulating(false);
      }
    },
    [shipmentId, objective],
  );

  useEffect(() => {
    if (!currentId) {
      ticket.current += 1; // drop any answer still on its way
      setSimulation(null);
      setSimulating(false);
      return;
    }
    simulate(currentId);
  }, [currentId, version, simulate]);

  useEffect(() => {
    onResult({ simulation, effects, simulating });
  }, [simulation, effects, simulating, onResult]);

  // Leaving the panel (for example when the route can no longer be found) clears the page's map.
  useEffect(() => () => onResult({ simulation: null, effects: [], simulating: false }), [onResult]);

  const types = effectTypesFor(kind);
  const options = useMemo(
    () => targetOptions(kind, index, pathCodes, closedTargetIds(effects)),
    [kind, index, pathCodes, effects],
  );
  const selectedTarget = options.some((o) => o.value === targetId) ? targetId : '';
  const selectedType = types.some((t) => t.value === type) ? type : types[0].value;
  const onRouteOptions = options.filter((o) => o.onRoute);
  const otherOptions = options.filter((o) => !o.onRoute);

  const replaceScenario = (updated) =>
    setScenarios((list) => list.map((s) => (s.id === updated.id ? updated : s)));

  async function closeTarget() {
    if (!selectedTarget) return;
    setSaving(true);
    setError('');
    try {
      const effect = buildEffect(kind, selectedTarget, selectedType);
      if (current) {
        replaceScenario(await apiPost(`/api/scenarios/${current.id}/effects`, effect));
      } else {
        const created = await apiPost('/api/scenarios', {
          name: nextScenarioName(scenarios),
          effects: [effect],
        });
        setScenarios((list) => [created, ...list]);
        setCurrentId(created.id);
      }
      setTargetId('');
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function reopen(effectId) {
    setSaving(true);
    setError('');
    try {
      replaceScenario(await apiDelete(`/api/scenarios/${current.id}/effects/${effectId}`));
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeScenario(scenario) {
    if (!window.confirm(`Delete "${scenario.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/api/scenarios/${scenario.id}`);
      setScenarios((list) => list.filter((s) => s.id !== scenario.id));
      if (scenario.id === currentId) setCurrentId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const reset = () => {
    setCurrentId(null);
    setError('');
  };

  const busy = saving || simulating;

  return (
    <Card className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-lg font-bold">What if? Crisis simulation</h2>
        <p className="mt-1 text-sm text-muted">
          Close a port or a lane and see how the route changes. Your saved scenarios are private,
          and the shared shipping network is never changed.
        </p>
      </div>

      {error && (
        <ErrorState
          title="Could not complete that"
          message={error}
          action={
            current && (
              <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
                Try again
              </Button>
            )
          }
        />
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          closeTarget();
        }}
      >
        <div role="radiogroup" aria-label="What to close" className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Close a</span>
          <div className="inline-flex w-fit rounded-lg border border-line bg-surface-2 p-1">
            {Object.entries(TARGET_KINDS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  kind === value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {kind === 'lane' ? 'Lane' : 'Port'}
            <select
              value={selectedTarget}
              onChange={(e) => setTargetId(e.target.value)}
              className={field}
            >
              <option value="">{kind === 'lane' ? 'Choose a lane' : 'Choose a port'}</option>
              {onRouteOptions.length > 0 && (
                <optgroup label="On the current route">
                  {onRouteOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherOptions.length > 0 && (
                <optgroup label="Elsewhere in the network">
                  {otherOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            What happens
            <select
              value={selectedType}
              onChange={(e) => setType(e.target.value)}
              className={field}
            >
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!selectedTarget || busy}>
            <Plus size={16} aria-hidden="true" />
            {current ? 'Close it too' : 'Close it'}
          </Button>
          {current && (
            <Button variant="secondary" onClick={reset} disabled={saving}>
              <RotateCcw size={16} aria-hidden="true" />
              Reset to original route
            </Button>
          )}
          {busy && <Spinner label={saving ? 'Saving' : 'Re-planning the route'} />}
        </div>
      </form>

      {current && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">
            Closed in {current.name}{' '}
            <Badge tone="warn">
              {effects.length === 1 ? '1 closure' : `${effects.length} closures`}
            </Badge>
          </h3>
          {effects.length === 0 && (
            <p className="text-sm text-muted">Nothing is closed, so the original route applies.</p>
          )}
          <ul aria-label="Closed ports and lanes" className="flex flex-col gap-1">
            {effects.map((effect) => (
              <li
                key={effect.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm"
              >
                <span>{describeEffect(effect, index).text}</span>
                <Button variant="ghost" onClick={() => reopen(effect.id)} disabled={busy}>
                  Reopen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <History size={16} aria-hidden="true" />
          Saved scenarios
        </h3>
        {loadingList && <Spinner label="Loading scenarios" />}
        {!loadingList && scenarios.length === 0 && (
          <p className="text-sm text-muted">
            None yet. The first closure you make is saved here automatically.
          </p>
        )}
        <ul aria-label="Saved scenarios" className="flex flex-col gap-1">
          {scenarios.map((scenario) => (
            <li
              key={scenario.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span>
                <span className="font-semibold">{scenario.name}</span>{' '}
                <span className="text-muted">
                  (
                  {scenario.effects.length === 1
                    ? '1 closure'
                    : `${scenario.effects.length} closures`}
                  )
                </span>
                {scenario.id === currentId && (
                  <Badge tone="info" className="ml-2">
                    Showing
                  </Badge>
                )}
              </span>
              <span className="flex items-center gap-1">
                {scenario.id !== currentId && (
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentId(scenario.id)}
                    disabled={busy}
                  >
                    Show
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => removeScenario(scenario)}
                  disabled={busy}
                  aria-label={`Delete ${scenario.name}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
