import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, SearchX } from 'lucide-react';
import HubLoader from '../components/HubLoader.jsx';
import { HubToolbar, Pager } from '../components/HubControls.jsx';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '../components/ui.jsx';
import {
  DOCUMENT_TYPES,
  STATUS_LABELS,
  STATUS_TONES,
  formatFileSize,
} from '../lib/documentView.js';
import { filterDocuments, paginate } from '../lib/hubView.js';

const STATUS_OPTIONS = [['', 'All statuses'], ...Object.entries(STATUS_LABELS)];
const TYPE_OPTIONS = [['', 'All types'], ...Object.entries(DOCUMENT_TYPES)];

function DocumentList({ items }) {
  const [filters, setFilters] = useState({ query: '', status: '', type: '' });
  const [page, setPage] = useState(1);
  const set = (name) => (value) => {
    setFilters((f) => ({ ...f, [name]: value }));
    setPage(1);
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Open a shipment and upload its invoice, packing list and certificate of origin."
        action={<LinkButton to="/shipments">Go to shipments</LinkButton>}
      />
    );
  }

  const shown = filterDocuments(items, filters);
  const pageInfo = paginate(shown, page);
  return (
    <>
      <HubToolbar
        query={filters.query}
        onQuery={set('query')}
        placeholder="Shipment, file name or type"
        filters={[
          {
            label: 'Status',
            value: filters.status,
            onChange: set('status'),
            options: STATUS_OPTIONS,
          },
          { label: 'Type', value: filters.type, onChange: set('type'), options: TYPE_OPTIONS },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No documents match these filters"
          description="Clear the search or choose All in the filters."
        />
      ) : (
        <Card as="ul" className="divide-y divide-line">
          {pageInfo.items.map((d) => (
            <li key={d.id}>
              <Link
                to={`/shipments/${d.shipmentId}/documents`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 hover:bg-surface-2"
              >
                <span className="font-mono font-semibold">{d.shipmentNumber}</span>
                <span className="min-w-40 flex-1">
                  <span className="block font-semibold">
                    {DOCUMENT_TYPES[d.documentType] ?? d.documentType}
                  </span>
                  <span className="block break-all text-sm text-muted">
                    {d.originalFilename} · {formatFileSize(d.sizeBytes)}
                  </span>
                </span>
                <Badge tone={STATUS_TONES[d.processingStatus]}>
                  {STATUS_LABELS[d.processingStatus] ?? d.processingStatus}
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

export default function DocumentsHub() {
  return (
    <div>
      <PageHeader
        title="Documents"
        description="Every document you uploaded, across all shipments. Open one to read, check and approve it."
      />
      <HubLoader path="/api/documents">{(items) => <DocumentList items={items} />}</HubLoader>
    </div>
  );
}
