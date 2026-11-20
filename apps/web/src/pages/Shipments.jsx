import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api.js';
import { INCOTERMS, validateShipmentForm } from '../lib/shipmentForm.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

const EMPTY_FORM = {
  shipmentNumber: '',
  originPortCode: '',
  destinationPortCode: '',
  incoterm: '',
};
const field = 'rounded bg-slate-800 p-2 text-slate-100';

export default function Shipments() {
  const { session } = useAuth();
  const [ports, setPorts] = useState([]);
  const [shipments, setShipments] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

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
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const portSelect = (name, label) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select value={form[name]} onChange={update(name)} className={field}>
        <option value="">Choose a port</option>
        {ports.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name} ({p.code})
          </option>
        ))}
      </select>
      {fieldErrors[name] && <span className="text-red-400">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-2xl flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Shipments</h1>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>{session?.user?.email}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="rounded bg-slate-800 px-3 py-1 text-slate-100 hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded bg-slate-900 p-4">
          <h2 className="text-xl font-semibold">New shipment</h2>
          <label className="flex flex-col gap-1 text-sm">
            Shipment number
            <input
              value={form.shipmentNumber}
              onChange={update('shipmentNumber')}
              className={field}
            />
            {fieldErrors.shipmentNumber && (
              <span className="text-red-400">{fieldErrors.shipmentNumber}</span>
            )}
          </label>
          {portSelect('originPortCode', 'Origin port')}
          {portSelect('destinationPortCode', 'Destination port')}
          <label className="flex flex-col gap-1 text-sm">
            Incoterm (optional)
            <select value={form.incoterm} onChange={update('incoterm')} className={field}>
              <option value="">Not set</option>
              {INCOTERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {fieldErrors.incoterm && <span className="text-red-400">{fieldErrors.incoterm}</span>}
          </label>
          {submitError && (
            <p role="alert" className="text-sm text-red-400">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-600 p-2 font-semibold hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? 'Creating...' : 'Create shipment'}
          </button>
        </form>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Your shipments</h2>
          {loadError && (
            <p role="alert" className="text-sm text-red-400">
              {loadError}
            </p>
          )}
          {!loadError && shipments === null && <p className="text-slate-400">Loading...</p>}
          {shipments?.length === 0 && (
            <p className="text-slate-400">You have no shipments yet. Create one above.</p>
          )}
          <ul className="flex flex-col gap-2">
            {shipments?.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/shipments/${s.id}`}
                  className="flex items-center justify-between rounded bg-slate-900 p-3 hover:bg-slate-800"
                >
                  <span className="font-mono">{s.shipmentNumber}</span>
                  <span className="text-sm text-slate-300">
                    {s.origin?.code} to {s.destination?.code}
                  </span>
                  <span className="text-xs text-slate-400">{s.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
