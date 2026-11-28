// Typed view of the shared JSX building blocks in ui.jsx, for the TypeScript pages. The runtime
// is the same components; only the prop types are added here.
import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import * as raw from './ui.jsx';
import type { Tone } from '../lib/intelligenceView.ts';

interface Common {
  children?: ReactNode;
  className?: string;
}

export const Badge = raw.Badge as unknown as ComponentType<
  Common & { tone?: Tone; title?: string }
>;

export const Card = raw.Card as unknown as ComponentType<
  Common & {
    as?: 'div' | 'section' | 'article' | 'aside';
    'aria-label'?: string;
    'aria-labelledby'?: string;
    id?: string;
  }
>;

export const Button = raw.Button as unknown as ComponentType<
  Common & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    type?: 'button' | 'submit';
    disabled?: boolean;
    onClick?: () => void;
    'aria-label'?: string;
    'aria-busy'?: boolean;
  }
>;

export const LinkButton = raw.LinkButton as unknown as ComponentType<
  Common & { to: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }
>;

export const PageHeader = raw.PageHeader as unknown as ComponentType<{
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}>;

export const Skeleton = raw.Skeleton as unknown as ComponentType<{ className?: string }>;

export const Spinner = raw.Spinner as unknown as ComponentType<{
  label?: string;
  className?: string;
}>;

export const EmptyState = raw.EmptyState as unknown as ComponentType<{
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}>;

export const ErrorState = raw.ErrorState as unknown as ComponentType<{
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}>;
