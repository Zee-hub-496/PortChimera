import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, FileText, Globe2, Plus, Ship } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { STATUS_LABELS, statusTone, summarizeShipments } from '../lib/overviewStats.js';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Skeleton,
} from '../components/ui.jsx';

const QUICK_ACTIONS = [
  { to: '/shipments', label: 'New shipment', Icon: Plus },
  { to: '/documents', label: 'Documents', Icon: FileText },
  { to: '/alerts', label: 'Alerts', Icon: AlertTriangle },
  { to: '/map', label: 'Global map', Icon: Globe2 },
];

function Kpi({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-bold text-fg">
        <AnimatedNumber value={value} />
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export default function Dashboard() {
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

  const stats = shipments ? summarizeShipments(shipments) : null;
  const latest = shipments?.slice(0, 5) ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader
        title="Dashboard"
        description="A summary of your own shipments."
        actions={
          <LinkButton to="/shipments">
            <Plus size={16} aria-hidden="true" /> New shipment
          </LinkButton>
        }
      />

      {error && (
        <ErrorState
          message={error}
          action={
            <Button variant="secondary" onClick={load}>
              Try again
            </Button>
          }
        />
      )}

      {!error && !stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total shipments" value={stats.total} />
            <Kpi label="Requires review" value={stats.needsReview} hint="Waiting for a person" />
            <Kpi label="Ports used" value={stats.portCount} hint="Origins and destinations" />
            <Kpi
              label="Cleared"
              value={stats.byStatus.cleared + stats.byStatus.ai_pre_cleared}
              hint="Includes AI pre-cleared"
            />
          </section>

          <section aria-label="Shipments by status" className="mt-4 flex flex-wrap gap-2">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <Badge key={status} tone={statusTone(status)}>
                {label}: <span className="font-mono">{stats.byStatus[status]}</span>
              </Badge>
            ))}
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2" aria-labelledby="latest-heading">
              <h2 id="latest-heading" className="mb-3 text-lg font-bold">
                Latest shipments
              </h2>
              {latest.length === 0 ? (
                <EmptyState
                  icon={Ship}
                  title="No shipments yet"
                  description="Create your first shipment to see it here."
                  action={<LinkButton to="/shipments">Create a shipment</LinkButton>}
                />
              ) : (
                <Card as="ul" className="divide-y divide-line">
                  {latest.map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/shipments/${s.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface-2"
                      >
                        <span className="font-mono font-semibold">{s.shipmentNumber}</span>
                        <span className="text-sm text-muted">
                          <span className="font-mono">{s.origin?.code}</span> to{' '}
                          <span className="font-mono">{s.destination?.code}</span>
                        </span>
                        <Badge tone={statusTone(s.status)}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </Card>
              )}
              {shipments.length > latest.length && (
                <Link
                  to="/shipments"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent"
                >
                  View all shipments <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </section>

            <aside className="flex flex-col gap-4">
              <Card className="p-4">
                <h2 className="text-base font-bold">Quick actions</h2>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {QUICK_ACTIONS.map(({ to, label, Icon }) => (
                    <li key={to}>
                      <Link
                        to={to}
                        className="flex h-full flex-col items-start gap-2 rounded-lg border border-line p-3 text-sm font-semibold hover:bg-surface-2"
                      >
                        <Icon size={16} className="text-accent" aria-hidden="true" />
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">Crisis simulation</h2>
                  <Badge tone="info">Coming soon</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  The rerouting logic exists in the core library. The screen to run a port strike
                  scenario is not built yet.
                </p>
              </Card>
            </aside>
          </div>
        </>
      )}
    </motion.div>
  );
}
