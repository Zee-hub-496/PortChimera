import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '../lib/api.js';
import { STATUS_LABELS, statusTone } from '../lib/overviewStats.js';
import { filterShipments } from '../lib/search.js';
import { INCOTERMS, validateShipmentForm } from '../lib/shipmentForm.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/ui.jsx';

const EMPTY_FORM = {
  shipmentNumber: '',
  originPortCode: '',
  destinationPortCode: '',
  incoterm: '',
};
const field =
  'rounded-lg border border-line bg-surface-2 p-2 text-fg placeholder:text-muted focus:border-accent';

export default function Shipments() {
  const [ports, setPorts] = useState([]);
  const [shipments, setShipments] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([apiGet('/api/ports'), apiGet('/api/shipments')]);
      setPorts(p);
      setShipments(s);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    const result = validateShipmentForm(form);
    setFieldErrors(result.errors);
    setSubmitError('');
    if (!result.valid) return;
    setBusy(true);
    try {
      await apiPost('/api/shipments', result.value);
      setForm(EMPTY_FORM);
      await load();
      toast.success('Shipment created');
    } catch (err) {
      setSubmitError(err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const portSelect = (name, label) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select value={form[name]} onChange={update(name)} className={field}>
        <option value="">Choose a port</option>
        {ports.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name} ({p.code})
          </option>
        ))}
      </select>
      {fieldErrors[name] && <span className="text-danger">{fieldErrors[name]}</span>}
    </label>
  );

  const visible = shipments ? filterShipments(shipments, query) : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Shipments"
        description="Create a shipment, then open it to add documents."
      />

      <Card as="form" onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">New shipment</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Shipment number
            <input
              value={form.shipmentNumber}
              onChange={update('shipmentNumber')}
              className={`${field} font-mono`}
            />
            {fieldErrors.shipmentNumber && (
              <span className="text-danger">{fieldErrors.shipmentNumber}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Incoterm (optional)
            <select value={form.incoterm} onChange={update('incoterm')} className={field}>
              <option value="">Not set</option>
              {INCOTERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {fieldErrors.incoterm && <span className="text-danger">{fieldErrors.incoterm}</span>}
          </label>
          {portSelect('originPortCode', 'Origin port')}
          {portSelect('destinationPortCode', 'Destination port')}
        </div>
        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? 'Creating...' : 'Create shipment'}
        </Button>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="your-shipments">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="your-shipments" className="text-lg font-bold">
            Your shipments
          </h2>
          <label className="relative">
            <span className="sr-only">Search shipments</span>
            <Search
              size={14}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, port or status"
              className={`${field} w-72 max-w-full pl-8`}
            />
          </label>
        </div>

        {loadError && (
          <ErrorState
            message={loadError}
            action={
              <Button variant="secondary" onClick={load}>
                Try again
              </Button>
            }
          />
        )}
        {!loadError && shipments === null && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}
        {shipments?.length === 0 && (
          <EmptyState
            icon={Ship}
            title="You have no shipments yet"
            description="Create one with the form above."
          />
        )}
        {shipments?.length > 0 && visible.length === 0 && (
          <EmptyState icon={Search} title="No shipments match your search" />
        )}
        {visible.length > 0 && (
          <Card as="ul" className="divide-y divide-line">
            {visible.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/shipments/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface-2"
                >
                  <span className="font-mono font-semibold">{s.shipmentNumber}</span>
                  <span className="text-sm text-muted">
                    <span className="font-mono">{s.origin?.code}</span> to{' '}
                    <span className="font-mono">{s.destination?.code}</span>
                  </span>
                  <Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status] ?? s.status}</Badge>
                </Link>
              </li>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
