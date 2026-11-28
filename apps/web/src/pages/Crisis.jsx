import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import HubLoader from '../components/HubLoader.jsx';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '../components/ui.jsx';
import { CRISIS_NOTICE, crisisCards, crisisSummary } from '../lib/crisisView.js';
import { ILLUSTRATIVE_NOTICE } from '../lib/routeView.js';

const BANNER_TONES = {
  warn: 'bg-warn-soft text-warn',
  success: 'bg-success-soft text-success',
  neutral: 'bg-surface-2 text-muted',
};

function ShipmentRow({ row }) {
  return (
    <li>
      <Link
        to={`/shipments/${row.shipmentId}/route`}
        className="flex flex-col gap-3 p-4 hover:bg-surface-2"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono font-semibold">{row.number}</span>
          <span className="text-sm text-muted">{row.lane}</span>
          <Badge tone={row.tone}>{row.statusLabel}</Badge>
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-accent">
            Open route <ArrowRight size={14} aria-hidden="true" />
          </span>
        </div>
        {row.headline && <p className="text-sm font-medium text-fg">{row.headline}</p>}
        {row.before && (
          <p className="text-sm">
            <span className="font-semibold">Before: </span>
            {row.before}
          </p>
        )}
        {row.rerouted && row.after && (
          <p className="text-sm">
            <span className="font-semibold">Now: </span>
            {row.after}
          </p>
        )}
        {row.extra.length > 0 && (
          <dl className="grid grid-cols-3 gap-2">
            {row.extra.map((e) => (
              <div key={e.key} className="rounded-lg border border-line p-2">
                <dt className="text-xs text-muted">{e.label}</dt>
                <dd className="mt-1">
                  <Badge tone={e.tone}>{e.value}</Badge>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Link>
    </li>
  );
}

function CrisisCard({ card }) {
  const hit = card.rows.length;
  return (
    <Card as="section" aria-label={card.name} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        <ShieldAlert size={18} aria-hidden="true" className="text-warn" />
        <h2 className="text-base font-semibold">{card.name}</h2>
        <Badge tone={hit > 0 ? 'warn' : 'success'} className="ml-auto">
          {hit > 0
            ? `${hit} ${hit === 1 ? 'shipment' : 'shipments'} affected`
            : 'No shipment affected'}
        </Badge>
        <ul className="flex w-full flex-wrap gap-2">
          {card.effects.map((line) => (
            <li key={line}>
              <Badge>{line}</Badge>
            </li>
          ))}
        </ul>
      </div>
      {hit > 0 ? (
        <ul className="divide-y divide-line">
          {card.rows.map((row) => (
            <ShipmentRow key={row.shipmentId} row={row} />
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">
          None of your shipments uses this closed port or lane on its fastest route.
        </p>
      )}
    </Card>
  );
}

function CrisisContent({ overview }) {
  const summary = crisisSummary(overview);
  const cards = crisisCards(overview);
  if (summary.state === 'none_set') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={summary.title}
        description={summary.text}
        action={<LinkButton to="/shipments">Go to shipments</LinkButton>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="status" className={`rounded-xl p-4 ${BANNER_TONES[summary.tone]}`}>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {summary.state === 'no_impact' && <CheckCircle2 size={18} aria-hidden="true" />}
          {summary.title}
        </h2>
        <p className="mt-1 text-sm text-fg">{summary.text}</p>
      </div>
      {cards.map((card) => (
        <CrisisCard key={card.id} card={card} />
      ))}
      {overview.limited && (
        <p className="text-xs text-muted">
          Only the newest crises and shipments were checked to keep this page fast.
        </p>
      )}
      <p className="text-xs text-muted">{ILLUSTRATIVE_NOTICE}</p>
    </div>
  );
}

export default function Crisis() {
  return (
    <div>
      <PageHeader
        title="Crisis monitor"
        description="Which of your shipments a crisis changes, the new route, and the extra time and cost."
      />
      <p className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{CRISIS_NOTICE}</p>
      <HubLoader path="/api/scenarios/impact">
        {(overview) => <CrisisContent overview={overview} />}
      </HubLoader>
    </div>
  );
}
