import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiUploadFile } from '../lib/api.js';
import {
  DOCUMENT_TYPES,
  POLL_INTERVAL_MS,
  STATUS_LABELS,
  buildReviewPayload,
  canProcess,
  canReview,
  describeError,
  fieldRows,
  initialEdits,
  lineTable,
  precheckFile,
  shouldPoll,
  shownPayload,
} from '../lib/documentView.js';

function DocumentCard({ shipmentId, documentType, summary, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [edits, setEdits] = useState({});
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const id = summary?.id;
  const status = detail?.processingStatus ?? summary?.processingStatus;

  const load = useCallback(async () => {
    if (!id) return;
    const d = await apiGet(`/api/documents/${id}`);
    setDetail(d);
    setEdits(initialEdits(d));
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(describeError(err)));
  }, [load]);

  // Ask the server again every 2 seconds while the document is being processed.
  useEffect(() => {
    if (!shouldPoll(status)) return;
    const timer = setInterval(() => {
      load().catch((err) => setError(describeError(err)));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, load]);

  async function run(action) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const upload = () =>
    run(async () => {
      const problem = precheckFile(file);
      if (problem) throw new Error(problem);
      await apiUploadFile(`/api/shipments/${shipmentId}/documents?type=${documentType}`, file);
      setFile(null);
      await onChanged();
    });

  const startProcessing = () =>
    run(async () => {
      await apiPost(`/api/documents/${id}/process`);
      await load();
    });

  const approve = () =>
    run(async () => {
      await apiPut(`/api/documents/${id}/review`, buildReviewPayload(shownPayload(detail), edits));
      await load();
      setMessage('Saved and approved.');
    });

  const download = () =>
    run(async () => {
      const { url } = await apiGet(`/api/documents/${id}/download`);
      window.open(url, '_blank', 'noopener');
    });

  const payload = shownPayload(detail);
  const rows = payload ? fieldRows(payload) : [];
  const lines = payload ? lineTable(payload) : null;

  return (
    <section className="flex flex-col gap-3 rounded bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">{DOCUMENT_TYPES[documentType]}</h2>

      {!summary && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            aria-label={`Choose ${DOCUMENT_TYPES[documentType]} file`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            onClick={upload}
            disabled={busy || !file}
            className="rounded bg-sky-600 px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      )}

      {summary && (
        <>
          <p className="text-sm text-slate-300">
            {summary.originalFilename ?? 'Uploaded file'}: <strong>{STATUS_LABELS[status]}</strong>
          </p>
          {status === 'failed' && (detail?.errorMessage ?? summary.errorMessage) && (
            <p className="text-sm text-red-400">{detail?.errorMessage ?? summary.errorMessage}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {canProcess(status) && (
              <button
                type="button"
                onClick={startProcessing}
                disabled={busy}
                className="rounded bg-sky-600 px-3 py-1 text-sm disabled:opacity-50"
              >
                {status === 'uploaded' ? 'Read with AI' : 'Read again with AI'}
              </button>
            )}
            <button
              type="button"
              onClick={download}
              disabled={busy}
              className="rounded bg-slate-700 px-3 py-1 text-sm disabled:opacity-50"
            >
              Download original
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      {summary && canReview(status) && payload && (
        <div className="flex flex-col gap-3">
          <p className="rounded bg-amber-900/40 p-2 text-xs text-amber-200">
            The AI suggested these values. Check each one against the document, fix mistakes, then
            approve. Fields marked with a warning need extra attention.
          </p>
          {rows.map((row) => (
            <label key={row.key} className="flex flex-col gap-1 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                {row.label}
                <span className="text-xs text-slate-400">
                  {row.confidence === null ? '' : `${row.confidence}% sure`} ({row.status})
                </span>
                {row.needsAttention && <span className="text-xs text-amber-300">Check this</span>}
              </span>
              <input
                value={edits[row.key] ?? ''}
                onChange={(e) => setEdits({ ...edits, [row.key]: e.target.value })}
                className="rounded bg-slate-800 p-2 text-slate-100"
              />
              <span className="text-xs text-slate-400">
                {row.evidenceLabel}
                {row.evidence ? `: "${row.evidence}"` : ''}
              </span>
            </label>
          ))}
          {lines && lines.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    {lines.columns.map((c) => (
                      <th key={c.key} className="pr-3">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => (
                        <td key={j} className="pr-3">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-400">Line items are saved as shown.</p>
            </div>
          )}
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="self-start rounded bg-emerald-600 px-3 py-1 text-sm disabled:opacity-50"
          >
            {status === 'reviewed' ? 'Save changes' : 'Confirm and approve'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function ShipmentDocuments() {
  const { id } = useParams();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDocs(await apiGet(`/api/shipments/${id}/documents`));
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else setError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        <Link to={`/shipments/${id}`} className="text-sm text-sky-400 underline">
          Back to shipment
        </Link>
        <h1 className="text-3xl font-bold">Documents</h1>
        <Link to={`/shipments/${id}/cross-check`} className="text-sm text-sky-400 underline">
          Cross-check these documents
        </Link>
        <p className="text-sm text-slate-300">
          Upload a PDF, JPEG or PNG (up to 5 MB) for each type. Use synthetic files only.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {docs === null && !error && <p className="text-slate-400">Loading...</p>}
        {docs &&
          Object.keys(DOCUMENT_TYPES).map((type) => (
            <DocumentCard
              key={type}
              shipmentId={id}
              documentType={type}
              summary={docs.find((d) => d.documentType === type)}
              onChanged={refresh}
            />
          ))}
      </div>
    </main>
  );
}
