import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../lib/api.js';
import {
  DECISIONS,
  DISCLAIMER,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  canDecide,
  describeCrossCheckError,
  differenceText,
  fieldLabel,
  sortFindings,
  summaryView,
  valueRows,
} from '../lib/crosscheckView.js';

function SummaryBox({ summary, discrepancies }) {
  const view = summaryView(summary, discrepancies);
  if (!view) return null;
  return (
    <section className="flex flex-col gap-2 rounded bg-slate-900 p-4" aria-label="Summary">
      <h2 className="text-lg font-semibold">{view.overallLabel}</h2>
      <p className="text-sm text-slate-300">
        {view.severityCounts.map((s) => `${s.label}: ${s.count}`).join('  |  ')}
      </p>
      <p className="text-sm text-slate-300">Still open: {view.openCount}</p>
      {view.multipleRiskIndicators && (
        <p className="text-sm text-amber-300">Multiple risk indicators were found together.</p>
      )}
      {view.comparedFields.length > 0 && (
        <p className="text-xs text-slate-400">Compared: {view.comparedFields.join(', ')}</p>
      )}
      {view.notCompared.length > 0 && (
        <div className="text-xs text-slate-400">
          <p>Not compared:</p>
          <ul className="list-disc pl-5">
            {view.notCompared.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Finding({ finding, busy, onDecide }) {
  const diff = differenceText(finding.difference);
  return (
    <li className="flex flex-col gap-2 rounded bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY_CLASSES[finding.severity]}`}>
          {SEVERITY_LABELS[finding.severity] ?? finding.severity}
        </span>
        <h3 className="font-semibold">{fieldLabel(finding.field)}</h3>
        <span className="text-xs text-slate-400">{STATUS_LABELS[finding.reviewStatus]}</span>
      </div>
      <table className="text-left text-sm">
        <tbody>
          {valueRows(finding).map((row) => (
            <tr key={row.documentType}>
              <th scope="row" className="pr-4 font-normal text-slate-400">
                {row.document}
              </th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {diff && <p className="text-sm">Difference: {diff}</p>}
      <p className="text-sm text-slate-300">{finding.explanation}</p>
      <p className="text-sm text-amber-200">{finding.recommendedAction}</p>
      {canDecide(finding) && (
        <div className="flex flex-wrap gap-2">
          {DECISIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              title={d.hint}
              disabled={busy}
              onClick={() => onDecide(finding.id, d.value)}
              className="rounded bg-slate-700 px-3 py-1 text-sm disabled:opacity-50"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export default function CrossCheck() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiGet(`/api/shipments/${id}/discrepancies`));
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else setError(describeCrossCheckError(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(describeCrossCheckError(err));
    } finally {
      setBusy(false);
    }
  }

  const runCheck = () =>
    act(async () => setData(await apiPost(`/api/shipments/${id}/cross-check`)));

  const decide = (discrepancyId, reviewStatus) =>
    act(async () => {
      await apiPatch(`/api/discrepancies/${discrepancyId}`, { review_status: reviewStatus });
      await load();
    });

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

  const findings = data ? sortFindings(data.discrepancies) : [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <Link to={`/shipments/${id}/documents`} className="text-sm text-sky-400 underline">
          Back to documents
        </Link>
        <h1 className="text-3xl font-bold">Cross-check</h1>
        <p className="rounded bg-amber-900/40 p-2 text-sm text-amber-200">{DISCLAIMER}</p>
        <p className="text-sm text-slate-300">
          Compares the approved invoice, packing list and certificate of origin. Running it again
          refreshes open items and keeps the decisions you already made.
        </p>
        <button
          type="button"
          onClick={runCheck}
          disabled={busy}
          className="self-start rounded bg-sky-600 px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? 'Working...' : data?.summary ? 'Run the check again' : 'Run the check'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {data === null && !error && <p className="text-slate-400">Loading...</p>}
        {data && !data.summary && (
          <p className="text-slate-400">The check has not been run for this shipment yet.</p>
        )}
        {data && <SummaryBox summary={data.summary} discrepancies={data.discrepancies} />}
        {data?.summary && findings.length === 0 && (
          <p className="text-emerald-400">No possible inconsistencies found.</p>
        )}
        {findings.length > 0 && (
          <ul className="flex flex-col gap-4">
            {findings.map((f) => (
              <Finding key={f.id} finding={f} busy={busy} onDecide={decide} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
