import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPatch, apiPost } from '../lib/api.js';
import {
  DECISIONS,
  DISCLAIMER,
  REVIEW_TONES,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  STATUS_LABELS,
  canDecide,
  describeCrossCheckError,
  differenceText,
  fieldLabel,
  sortFindings,
  summaryView,
  valueRows,
} from '../lib/crosscheckView.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/ui.jsx';

function SummaryBox({ summary, discrepancies }) {
  const view = summaryView(summary, discrepancies);
  if (!view) return null;
  return (
    <Card as="section" className="flex flex-col gap-3 p-4" aria-label="Summary">
      <h2 className="text-lg font-bold">{view.overallLabel}</h2>
      <div className="flex flex-wrap gap-2">
        {view.severityCounts.map((s) => (
          <Badge key={s.severity} tone={SEVERITY_TONES[s.severity]}>
            {s.label}: <span className="font-mono">{s.count}</span>
          </Badge>
        ))}
      </div>
      <p className="text-sm text-muted">
        Still open: <span className="font-mono">{view.openCount}</span>
      </p>
      {view.multipleRiskIndicators && (
        <p className="text-sm text-warn">Multiple risk indicators were found together.</p>
      )}
      {view.comparedFields.length > 0 && (
        <p className="text-xs text-muted">Compared: {view.comparedFields.join(', ')}</p>
      )}
      {view.notCompared.length > 0 && (
        <div className="text-xs text-muted">
          <p>Not compared:</p>
          <ul className="list-disc pl-5">
            {view.notCompared.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Finding({ finding, busy, onDecide }) {
  const diff = differenceText(finding.difference);
  const rows = valueRows(finding);
  return (
    <li>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONES[finding.severity]}>
            {SEVERITY_LABELS[finding.severity] ?? finding.severity}
          </Badge>
          <h3 className="font-bold">{fieldLabel(finding.field)}</h3>
          <Badge tone={REVIEW_TONES[finding.reviewStatus]} className="ml-auto">
            {STATUS_LABELS[finding.reviewStatus] ?? finding.reviewStatus}
          </Badge>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.documentType}
              className={`rounded-lg border p-3 ${
                diff ? 'border-warn bg-warn-soft' : 'border-line bg-surface-2'
              }`}
            >
              <dt className="text-xs font-semibold text-muted">{row.document}</dt>
              <dd className="mt-1 break-words font-mono text-base text-fg">{row.value}</dd>
            </div>
          ))}
        </dl>
        {diff && (
          <p className="text-sm">
            Difference: <span className="font-mono font-semibold text-warn">{diff}</span>
          </p>
        )}
        <p className="text-sm text-muted">{finding.explanation}</p>
        <p className="text-sm font-medium text-fg">{finding.recommendedAction}</p>
        {canDecide(finding) && (
          <div className="flex flex-wrap gap-2">
            {DECISIONS.map((d) => (
              <Button
                key={d.value}
                variant="secondary"
                title={d.hint}
                disabled={busy}
                onClick={() => onDecide(finding.id, d.value)}
                className="px-3 py-1"
              >
                {d.label}
              </Button>
            ))}
          </div>
        )}
      </Card>
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
      toast.error(describeCrossCheckError(err));
    } finally {
      setBusy(false);
    }
  }

  const runCheck = () =>
    act(async () => {
      setData(await apiPost(`/api/shipments/${id}/cross-check`));
      toast.success('Cross-check finished');
    });

  const decide = (discrepancyId, reviewStatus) =>
    act(async () => {
      await apiPatch(`/api/discrepancies/${discrepancyId}`, { review_status: reviewStatus });
      await load();
      toast.success('Decision saved');
    });

  // The shipment layout already shows the not-found state.
  if (notFound) return null;

  const findings = data ? sortFindings(data.discrepancies) : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Cross-check"
        description="Compares the approved invoice, packing list and certificate of origin. Running it again refreshes open items and keeps the decisions you already made."
        actions={
          <Button onClick={runCheck} disabled={busy}>
            <ShieldCheck size={16} aria-hidden="true" />
            {busy ? 'Working...' : data?.summary ? 'Run the check again' : 'Run the check'}
          </Button>
        }
      />
      <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">{DISCLAIMER}</p>
      {error && <ErrorState message={error} />}
      {data === null && !error && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
        </div>
      )}
      {data && !data.summary && (
        <EmptyState
          icon={ShieldCheck}
          title="The check has not been run yet"
          description="Approve at least two documents, then run the check."
        />
      )}
      {data && <SummaryBox summary={data.summary} discrepancies={data.discrepancies} />}
      {data?.summary && findings.length === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title="No possible inconsistencies found"
          description="Nothing was flagged in the fields that were compared."
        />
      )}
      {findings.length > 0 && (
        <ul className="flex flex-col gap-4">
          {findings.map((f) => (
            <Finding key={f.id} finding={f} busy={busy} onDecide={decide} />
          ))}
        </ul>
      )}
    </div>
  );
}
