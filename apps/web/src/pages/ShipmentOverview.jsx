import { Link, useOutletContext } from 'react-router-dom';
import { AlertTriangle, FileText, Route as RouteIcon } from 'lucide-react';
import { STATUS_LABELS, statusTone } from '../lib/overviewStats.js';
import { Badge, Card, PageHeader, Skeleton } from '../components/ui.jsx';

const LINKS = [
  {
    to: 'documents',
    label: 'Documents',
    text: 'Upload and review the shipment documents.',
    Icon: FileText,
  },
  {
    to: 'cross-check',
    label: 'Cross-check',
    text: 'Look for possible inconsistencies between documents.',
    Icon: AlertTriangle,
  },
  {
    to: 'route',
    label: 'Route',
    text: 'See an illustrative route between the ports.',
    Icon: RouteIcon,
  },
];

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

const portText = (port) =>
  port ? (
    <>
      {port.name} <span className="font-mono text-muted">({port.code})</span>
    </>
  ) : (
    'Unknown'
  );

export default function ShipmentOverview() {
  const { shipment } = useOutletContext();

  return (
    <div>
      <PageHeader title="Shipment overview" description="The details stored for this shipment." />
      {!shipment ? (
        <Skeleton className="h-40" />
      ) : (
        <Card className="p-5">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Shipment number">
              <span className="font-mono">{shipment.shipmentNumber}</span>
            </Detail>
            <Detail label="Status">
              <Badge tone={statusTone(shipment.status)}>
                {STATUS_LABELS[shipment.status] ?? shipment.status}
              </Badge>
            </Detail>
            <Detail label="Incoterm">
              {shipment.incoterm ? (
                <span className="font-mono">{shipment.incoterm}</span>
              ) : (
                'Not set'
              )}
            </Detail>
            <Detail label="Origin">{portText(shipment.origin)}</Detail>
            <Detail label="Destination">{portText(shipment.destination)}</Detail>
            {shipment.createdAt && (
              <Detail label="Created">{new Date(shipment.createdAt).toLocaleDateString()}</Detail>
            )}
          </dl>
        </Card>
      )}
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {LINKS.map(({ to, label, text, Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card hover:bg-surface-2"
            >
              <Icon size={18} className="text-accent" aria-hidden="true" />
              <span className="font-bold text-fg">{label}</span>
              <span className="text-sm text-muted">{text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
