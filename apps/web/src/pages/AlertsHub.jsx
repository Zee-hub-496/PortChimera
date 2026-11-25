import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, SearchX } from 'lucide-react';
import HubLoader from '../components/HubLoader.jsx';
import { HubToolbar, Pager } from '../components/HubControls.jsx';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '../components/ui.jsx';
import {
  DISCLAIMER,
  REVIEW_TONES,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  SEVERITY_TONES,
  STATUS_LABELS,
  differenceText,
  documentLabel,
  fieldLabel,
} from '../lib/crosscheckView.js';
import { filterAlerts, paginate } from '../lib/hubView.js';

const SEVERITY_OPTIONS = [
  ['', 'All severities'],
  ...SEVERITY_ORDER.map((s) => [s, SEVERITY_LABELS[s]]),
];
const STATUS_OPTIONS = [['', 'All decisions'], ...Object.entries(STATUS_LABELS)];

function AlertList({ items }) {
  const [filters, setFilters] = useState({ query: '', severity: '', status: '' });
  const [page, setPage] = useState(1);
  const set = (name) => (value) => {
    setFilters((f) => ({ ...f, [name]: value }));
    setPage(1);
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No possible inconsistencies found yet"
        description="Findings appear here after you run a cross-check on a shipment with at least two approved documents."
        action={<LinkButton to="/shipments">Go to shipments</LinkButton>}
      />
    );
  }

  const shown = filterAlerts(items, filters);
  const pageInfo = paginate(shown, page);
  return (
    <>
      <HubToolbar
        query={filters.query}
        onQuery={set('query')}
        placeholder="Shipment, field or document"
        filters={[
          {
            label: 'Severity',
            value: filters.severity,
            onChange: set('severity'),
            options: SEVERITY_OPTIONS,
          },
          {
            label: 'Decision',
            value: filters.status,
            onChange: set('status'),
            options: STATUS_OPTIONS,
          },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No findings match these filters"
          description="Clear the search or choose All in the filters."
        />
      ) : (
        <Card as="ul" className="divide-y divide-line">
          {pageInfo.items.map((f) => (
            <li key={f.id}>
              <Link
                to={`/shipments/${f.shipmentId}/cross-check`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 hover:bg-surface-2"
              >
                <span className="font-mono font-semibold">{f.shipmentNumber}</span>
                <span className="min-w-40 flex-1">
                  <span className="block font-semibold">{fieldLabel(f.field)}</span>
                  <span className="block text-sm text-muted">
                    {f.documents.map(documentLabel).join(' and ')}
                    {differenceText(f.difference) &&
                      ` · differs by ${differenceText(f.difference)}`}
                  </span>
                </span>
                <Badge tone={SEVERITY_TONES[f.severity]}>
                  {SEVERITY_LABELS[f.severity] ?? f.severity}
                </Badge>
                <Badge tone={REVIEW_TONES[f.reviewStatus]}>
                  {STATUS_LABELS[f.reviewStatus] ?? f.reviewStatus}
                </Badge>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  Open <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </Card>
      )}
      <Pager pageInfo={pageInfo} onPage={setPage} />
    </>
  );
}

export default function AlertsHub() {
  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Possible inconsistencies found by the cross-check, across all your shipments. Open one to see the evidence and record a decision."
      />
      <p className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{DISCLAIMER}</p>
      <HubLoader path="/api/discrepancies">{(items) => <AlertList items={items} />}</HubLoader>
    </div>
  );
}
