import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Search, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCommandPalette } from '../components/CommandPalette.jsx';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { Badge, LinkButton } from '../components/ui.jsx';
import { apiGet } from '../lib/api.js';
import { DISCLAIMERS, FOOTER_COLUMNS, NAV_LINKS } from '../lib/siteContent.js';

function ApiStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let cancelled = false;
    apiGet('/api/health')
      .then((data) => !cancelled && setStatus(data.status === 'ok' ? 'ok' : String(data.status)))
      .catch(() => !cancelled && setStatus('unreachable'));
    return () => {
      cancelled = true;
    };
  }, []);
  const tone = status === 'ok' ? 'success' : status === 'checking' ? 'neutral' : 'warn';
  return (
    <Badge tone={tone}>
      API status: <span className="font-mono">{status}</span>
    </Badge>
  );
}

function SearchButton({ className = '' }) {
  const { openPalette } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Search (Ctrl+K)"
      className={`inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:text-fg ${className}`}
    >
      <Search size={15} aria-hidden="true" />
      <span className="hidden lg:inline">Search</span>
      <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] lg:inline">
        Ctrl K
      </kbd>
    </button>
  );
}

export default function PublicLayout() {
  const { session } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer after any navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  const authButtons = session ? (
    <LinkButton to="/dashboard" variant="primary">
      Dashboard
    </LinkButton>
  ) : (
    <>
      <LinkButton to="/login" variant="ghost">
        Log In
      </LinkButton>
      <LinkButton to="/register" variant="primary">
        Get Started
      </LinkButton>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" aria-label="PortChimera home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <SearchButton />
            <ThemeToggle />
            {authButtons}
          </div>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <SearchButton />
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg border border-line bg-surface p-2 text-fg"
            >
              {menuOpen ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Menu size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-line bg-canvas md:hidden"
            >
              <nav aria-label="Mobile" className="flex flex-col gap-1 p-4">
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    to={l.href}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-2"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="mt-2 flex items-center gap-2">{authButtons}</div>
                <ThemeToggle variant="menu" className="mt-3 self-start" />
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-6">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted">
              Cross-check trade documents with fixed rules, and compare sea routes between ports.
            </p>
            <div className="mt-4">
              <ApiStatus />
            </div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-sm font-bold text-fg">{col.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <Link to={l.href} className="text-muted hover:text-fg">
                        {l.label}
                      </Link>
                    ) : (
                      <span className="text-muted">{l.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted">
            <p>{DISCLAIMERS.footer}</p>
            <p>{DISCLAIMERS.ai}</p>
            <p>
              Map data © OpenStreetMap contributors, basemap © CARTO. Port positions are
              illustrative.
            </p>
            <p>© {new Date().getFullYear()} PortChimera</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
