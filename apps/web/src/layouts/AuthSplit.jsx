import { Link } from 'react-router-dom';
import { Compass, FileSearch, Lock, Route } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const VALUE_PROPS = [
  { Icon: FileSearch, text: 'AI reads trade documents and shows where each value was found.' },
  { Icon: Compass, text: 'Fixed rules flag possible inconsistencies for manual verification.' },
  { Icon: Route, text: 'Compare fastest, cheapest and lowest-risk sea routes.' },
  { Icon: Lock, text: 'Each account only sees its own shipments and documents.' },
];

/**
 * Split-screen frame for Login and Register. Left: branding. Right: the form (children).
 * @param {{title: string, subtitle?: string, children: import('react').ReactNode, footer?: import('react').ReactNode}} props
 */
export default function AuthSplit({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <aside className="bg-grid relative hidden overflow-hidden bg-brand p-12 text-brand-fg lg:flex lg:flex-col lg:justify-between">
        <div className="bg-glow absolute inset-0" aria-hidden="true" />
        <svg
          aria-hidden="true"
          viewBox="0 0 200 200"
          className="absolute -bottom-24 -right-24 h-96 w-96 opacity-10"
        >
          <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="100,20 112,100 88,100" fill="currentColor" />
          <polygon points="88,100 112,100 100,180" fill="currentColor" opacity="0.5" />
        </svg>
        <div className="relative">
          <h2 className="max-w-md text-3xl font-semibold tracking-tight">
            Trade documents, checked. Sea routes, compared.
          </h2>
          <ul className="mt-8 max-w-md space-y-4">
            {VALUE_PROPS.map(({ Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm opacity-90">
                <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs opacity-70">
          Student project. Findings need manual verification.
        </p>
      </aside>
      <section className="flex flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" aria-label="PortChimera home" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
          <ThemeToggle className="mt-8" />
        </div>
      </section>
    </div>
  );
}
