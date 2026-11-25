import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { STATUS_LABELS, statusTone } from '../lib/overviewStats.js';
import { Badge, EmptyState, ErrorState, LinkButton, Skeleton } from '../components/ui.jsx';
import { useRememberShipment } from './AppLayout.jsx';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'documents', label: 'Documents' },
  { to: 'cross-check', label: 'Cross-check' },
  { to: 'route', label: 'Route' },
];

/**
 * Shared frame for /shipments/:id/*. Loads the shipment once and passes it to the tab pages
 * through the outlet context (read it with useOutletContext).
 */
export default function ShipmentLayout() {
  const { id } = useParams();
  const remember = useRememberShipment();
  const [shipment, setShipment] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let ignore = false;
    setShipment(null);
    setError('');
    setNotFound(false);
    apiGet(`/api/shipments/${id}`)
      .then((s) => {
        if (ignore) return;
        setShipment(s);
        remember(id, s.shipmentNumber);
      })
      .catch((err) => {
        if (ignore) return;
        if (err.status === 404) setNotFound(true);
        else setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [id, remember]);

  if (notFound) {
    return (
      <EmptyState
        icon={Ship}
        title="Shipment not found"
        description="It may have been removed, or it belongs to another account."
        action={<LinkButton to="/shipments">Back to shipments</LinkButton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-14 z-10 -mx-4 border-b border-line bg-canvas/95 px-4 pt-2 backdrop-blur md:-mx-6 md:px-6">
        {shipment ? (
          <div className="flex flex-wrap items-center gap-3 py-2">
            <p className="text-lg font-semibold text-fg">
              <span className="font-mono">{shipment.shipmentNumber}</span>
              <span aria-hidden="true"> &bull; </span>
              <span className="sr-only">, </span>
              {shipment.origin?.name}{' '}
              <span className="font-mono text-sm">({shipment.origin?.code})</span>
              <span aria-hidden="true"> &rarr; </span>
              <span className="sr-only"> to </span>
              {shipment.destination?.name}{' '}
              <span className="font-mono text-sm">({shipment.destination?.code})</span>
            </p>
            <Badge tone={statusTone(shipment.status)}>
              {STATUS_LABELS[shipment.status] ?? shipment.status}
            </Badge>
          </div>
        ) : (
          <div className="py-2" aria-busy="true">
            <Skeleton className="h-7 w-72 max-w-full" />
          </div>
        )}
        <nav aria-label="Shipment sections" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ to, label, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {error ? (
        <ErrorState title="Could not load this shipment" message={error} />
      ) : (
        <Outlet context={{ shipment }} />
      )}
    </div>
  );
}
