import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from './ui.jsx';
import { rangeText } from '../lib/hubView.js';

const control =
  'rounded-lg border border-line bg-surface-2 p-2 text-sm text-fg placeholder:text-muted focus:border-accent';

/** Search box plus any number of dropdown filters. `filters`: [{ label, value, onChange, options: [[value, label]] }] */
export function HubToolbar({ query, onQuery, placeholder, filters = [] }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
        Search
        <span className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className={`${control} w-full pl-8`}
          />
        </span>
      </label>
      {filters.map((f) => (
        <label key={f.label} className="flex flex-col gap-1 text-sm font-medium">
          {f.label}
          <select value={f.value} onChange={(e) => f.onChange(e.target.value)} className={control}>
            {f.options.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** Previous / next buttons and the "Showing x to y of z" text. `pageInfo` comes from paginate(). */
export function Pager({ pageInfo, onPage }) {
  if (pageInfo.total === 0) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted" aria-live="polite">
        {rangeText(pageInfo)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={pageInfo.page <= 1}
          onClick={() => onPage(pageInfo.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </Button>
        <span className="text-sm text-muted">
          Page {pageInfo.page} of {pageInfo.pages}
        </span>
        <Button
          variant="secondary"
          disabled={pageInfo.page >= pageInfo.pages}
          onClick={() => onPage(pageInfo.page + 1)}
          aria-label="Next page"
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
