import { Search } from 'lucide-react';
import { useCommandPalette } from '../components/CommandPalette.jsx';
import { Button, LinkButton } from '../components/ui.jsx';

export default function NotFound() {
  const { openPalette } = useCommandPalette();
  return (
    <div className="bg-grid mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <svg
        viewBox="0 0 120 120"
        width="120"
        height="120"
        aria-hidden="true"
        className="text-accent"
      >
        <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle
          cx="60"
          cy="60"
          r="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <polygon points="60,18 68,60 52,60" fill="currentColor" transform="rotate(35 60 60)" />
        <polygon
          points="52,60 68,60 60,102"
          fill="currentColor"
          opacity="0.4"
          transform="rotate(35 60 60)"
        />
        <circle cx="60" cy="60" r="4" fill="var(--surface)" />
      </svg>
      <p className="mt-6 font-mono text-sm text-muted">404</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-fg">Off the chart</h1>
      <p className="mt-2 text-muted">This page does not exist. Check the address or head back.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <LinkButton to="/">Home</LinkButton>
        <LinkButton to="/dashboard" variant="secondary">
          Dashboard
        </LinkButton>
        <Button variant="ghost" onClick={openPalette}>
          <Search size={15} aria-hidden="true" /> Search (Ctrl+K)
        </Button>
      </div>
    </div>
  );
}
