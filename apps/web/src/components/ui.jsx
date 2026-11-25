// Shared building blocks. Colours come from the theme tokens in index.css only.
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const BUTTON_VARIANTS = {
  primary:
    'bg-accent text-accent-fg shadow-sm hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)]',
  secondary: 'border border-line bg-surface text-fg shadow-sm hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-brand-fg shadow-sm hover:brightness-110',
};

/** Class string shared by Button and LinkButton. */
export function buttonClass(variant = 'primary', className = '') {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary} ${className}`;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

export function LinkButton({ variant = 'primary', className = '', ...rest }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

export function Card({ className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-surface shadow-card ${className}`}
      {...rest}
    />
  );
}

export const BADGE_TONES = {
  neutral: 'bg-surface-2 text-muted',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

/** Status pill. Always put readable text inside, colour is never the only signal. */
export function Badge({ tone = 'neutral', className = '', ...rest }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
        BADGE_TONES[tone] ?? BADGE_TONES.neutral
      } ${className}`}
      {...rest}
    />
  );
}

export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}

export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 text-sm text-muted ${className}`}
    >
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center ${className}`}
    >
      {Icon && (
        <span className="mb-3 rounded-full bg-accent-soft p-3 text-accent">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      <h2 className="text-base font-bold text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, action, className = '' }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-line bg-danger-soft p-4 ${className}`}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-bold text-danger">{title}</p>
        {message && <p className="mt-0.5 text-fg">{message}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
