import { ExternalLink, MapPin } from 'lucide-react';
import type { DisruptionEvent } from '@portchimera/core/v2';
import { Badge, Card } from './uiKit.ts';
import {
  CATEGORY_LABELS,
  CHOKEPOINT_NAMES,
  RELEVANCE_TONES,
  SOURCE_CLASS_LABELS,
  SOURCE_CLASS_TONES,
  formatUtc,
} from '../lib/intelligenceView.ts';

/** One reported event. The headline and source are untrusted text and are shown as plain text. */
export default function EventCard({ event }: { event: DisruptionEvent }) {
  const published = formatUtc(event.publishedAt);
  const retrieved = formatUtc(event.retrievedAt);
  const places = event.chokepointIds.map((id) => CHOKEPOINT_NAMES[id] ?? id);
  return (
    <Card as="article" className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{CATEGORY_LABELS[event.category]}</Badge>
        <Badge tone={SOURCE_CLASS_TONES[event.sourceClass]}>
          {SOURCE_CLASS_LABELS[event.sourceClass]}
        </Badge>
        <Badge tone={RELEVANCE_TONES[event.relevance]}>
          Relevance: {event.relevance.toLowerCase()}
        </Badge>
        {event.closureLanguage && <Badge tone="warn">Mentions a closure</Badge>}
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-fg">
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-start gap-1 hover:underline"
        >
          <span>{event.headline}</span>
          <ExternalLink size={14} aria-hidden="true" className="mt-1 shrink-0 text-muted" />
          <span className="sr-only">(opens the original article in a new tab)</span>
        </a>
      </h3>
      <p className="mt-1 text-sm text-muted">
        No summary is provided by the source. Open the original article for details.
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="font-semibold">Source:</dt>
          <dd className="min-w-0 truncate">{event.source}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-semibold">Published:</dt>
          <dd>{published ?? 'not provided'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-semibold">Retrieved:</dt>
          <dd>{retrieved ?? 'unknown'}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="font-semibold">Area:</dt>
          <dd className="inline-flex items-center gap-1">
            {event.region ? (
              <>
                <MapPin size={12} aria-hidden="true" />
                {event.region}
                {places.length > 0 && ` (${places.join(', ')})`}
              </>
            ) : (
              'not identified'
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
