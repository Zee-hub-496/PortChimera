import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Light / System / Dark switch. `compact` shows icons only; `menu` shows icons and labels.
 * @param {{variant?: 'compact'|'menu', className?: string}} props
 */
export default function ThemeToggle({ variant = 'compact', className = '' }) {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex rounded-lg border border-line bg-surface-2 p-0.5 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
              active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {variant === 'menu' && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
