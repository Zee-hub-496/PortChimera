import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPut, apiUploadFile } from '../lib/api.js';
import {
  DOCUMENT_TYPES,
  POLL_INTERVAL_MS,
  STATUS_LABELS,
  STATUS_TONES,
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
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/ui.jsx';

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
      toast.error(describeError(err));
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
      toast.success('File uploaded');
    });

  const startProcessing = () =>
    run(async () => {
      await apiPost(`/api/documents/${id}/process`);
      await load();
      toast.success('The AI started reading the document');
    });

  const approve = () =>
    run(async () => {
      await apiPut(`/api/documents/${id}/review`, buildReviewPayload(shownPayload(detail), edits));
      await load();
      setMessage('Saved and approved.');
      toast.success('Saved and approved');
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
    <Card as="section" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <FileText size={18} className="text-accent" aria-hidden="true" />
          {DOCUMENT_TYPES[documentType]}
        </h2>
        {summary && status && <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>}
      </div>

      {!summary && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            aria-label={`Choose ${DOCUMENT_TYPES[documentType]} file`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-fg"
          />
          <Button onClick={upload} disabled={busy || !file} className="px-3 py-1">
            {busy ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      )}

      {summary && (
        <>
          <p className="text-sm text-muted">{summary.originalFilename ?? 'Uploaded file'}</p>
          {status === 'failed' && (detail?.errorMessage ?? summary.errorMessage) && (
            <p className="text-sm text-danger">{detail?.errorMessage ?? summary.errorMessage}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {canProcess(status) && (
              <Button onClick={startProcessing} disabled={busy} className="px-3 py-1">
                {status === 'uploaded' ? 'Read with AI' : 'Read again with AI'}
              </Button>
            )}
            <Button variant="secondary" onClick={download} disabled={busy} className="px-3 py-1">
              Download original
            </Button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-success">{message}</p>}

      {summary && canReview(status) && payload && (
        <div className="flex flex-col gap-3">
          <p className="rounded-lg bg-warn-soft p-2 text-xs text-warn">
            The AI suggested these values. Check each one against the document, fix mistakes, then
            approve. Fields marked with a warning need extra attention.
          </p>
          {rows.map((row) => (
            <label key={row.key} className="flex flex-col gap-1 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                {row.label}
                <span className="text-xs text-muted">
                  {row.confidence === null ? '' : `${row.confidence}% sure`} ({row.status})
                </span>
                {row.needsAttention && <Badge tone="warn">Check this</Badge>}
              </span>
              <input
                value={edits[row.key] ?? ''}
                onChange={(e) => setEdits({ ...edits, [row.key]: e.target.value })}
                className="rounded-lg border border-line bg-surface-2 p-2 text-fg"
              />
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={row.evidenceLabel === 'Found in the document' ? 'success' : 'neutral'}>
                  {row.evidenceLabel === 'Found in the document'
                    ? 'Found in document'
                    : row.evidenceLabel}
                </Badge>
                {row.evidence ? `"${row.evidence}"` : ''}
              </span>
            </label>
          ))}
          {lines && lines.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
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
              <p className="text-xs text-muted">Line items are saved as shown.</p>
            </div>
          )}
          <Button onClick={approve} disabled={busy} className="self-start px-3 py-1">
            <CheckCircle2 size={16} aria-hidden="true" />
            {status === 'reviewed' ? 'Save changes' : 'Confirm and approve'}
          </Button>
        </div>
      )}
    </Card>
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

  // The shipment layout already shows the not-found state.
  if (notFound) return null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Documents"
        description="Upload a PDF, JPEG or PNG (up to 5 MB) for each type. Use synthetic files only."
        actions={
          <Link
            to={`/shipments/${id}/cross-check`}
            className="text-sm font-semibold text-accent underline"
          >
            Cross-check these documents
          </Link>
        }
      />
      {error && <ErrorState message={error} />}
      {docs === null && !error && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}
      {docs?.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No documents uploaded yet"
          description="Choose a file for each document type below."
        />
      )}
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
  );
}
