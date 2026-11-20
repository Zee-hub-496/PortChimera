import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Ship } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { STATUS_LABELS, statusTone } from '../lib/overviewStats.js';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, Skeleton } from './ui.jsx';

/**
 * Lists the user's shipments, each linking to one tab of that shipment.
 * Used by the Documents and Alerts hubs. Data comes from GET /api/shipments only.
 * @param {{tab: 'documents'|'cross-check', linkLabel: string}} props
 */
export default function ShipmentHubList({ tab, linkLabel }) {
  const [shipments, setShipments] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setShipments(await apiGet('/api/shipments'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <ErrorState
        message={error}
        action={
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!shipments) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (shipments.length === 0) {
    return (
      <EmptyState
        icon={Ship}
        title="No shipments yet"
        description="Create a shipment first, then come back here."
        action={<LinkButton to="/shipments">Create a shipment</LinkButton>}
      />
    );
  }
  return (
    <Card as="ul" className="divide-y divide-line">
      {shipments.map((s) => (
        <li key={s.id}>
          <Link
            to={`/shipments/${s.id}/${tab}`}
            className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface-2"
          >
            <span className="font-mono font-semibold">{s.shipmentNumber}</span>
            <span className="text-sm text-muted">
              <span className="font-mono">{s.origin?.code}</span> to{' '}
              <span className="font-mono">{s.destination?.code}</span>
            </span>
            <Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status] ?? s.status}</Badge>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
              {linkLabel} <ArrowRight size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </Card>
  );
}
