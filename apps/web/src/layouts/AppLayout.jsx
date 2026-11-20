import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Ship,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { useCommandPalette } from '../components/CommandPalette.jsx';
import { buildBreadcrumbs } from '../lib/breadcrumbs.js';
import { supabase } from '../lib/supabase.js';

const SIDEBAR_KEY = 'portchimera-sidebar';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/shipments', label: 'Shipments', Icon: Ship },
  { to: '/map', label: 'Global Map', Icon: Globe2 },
  { to: '/documents', label: 'Documents', Icon: FileText },
  { to: '/alerts', label: 'Alerts', Icon: AlertTriangle },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

const COMING_SOON = ['Crisis simulation', 'Customs estimates'];

// Shipment pages report their number here so breadcrumbs can show it instead of the id.
const ShipmentNamesContext = createContext({ names: {}, remember: () => {} });

/** Call from a page that knows a shipment's number. */
export function useRememberShipment() {
  return useContext(ShipmentNamesContext).remember;
}

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function SidebarNav({ collapsed, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-surface-2 hover:text-fg'
            } ${collapsed ? 'justify-center' : ''}`
          }
        >
          <Icon size={18} aria-hidden="true" className="shrink-0" />
          {!collapsed && <span>{label}</span>}
        </NavLink>
      ))}
      {!collapsed && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Coming soon
          </p>
          <ul>
            {COMING_SOON.map((label) => (
              <li
                key={label}
                aria-disabled="true"
                className="cursor-not-allowed px-3 py-1.5 text-sm text-muted opacity-60"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

function ProfileMenu({ email }) {
  const [open, setOpen] = useState(false);
  const initial = (email ?? '?').charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg"
      >
        {initial}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-pop"
          >
            <p className="px-3 py-2 text-xs text-muted">Signed in as</p>
            <p className="truncate px-3 pb-2 text-sm font-semibold text-fg">{email}</p>
            <Link
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg hover:bg-surface-2"
            >
              <Settings size={16} aria-hidden="true" /> Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => supabase.auth.signOut()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg hover:bg-surface-2"
            >
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0" />}
            {c.to ? (
              <Link to={c.to} className="truncate hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-semibold text-fg">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function AppLayout() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const { openPalette } = useCommandPalette();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [names, setNames] = useState({});

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Storage can be blocked; the sidebar still works for this visit.
    }
  }, [collapsed]);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const remember = useCallback(
    (id, number) => setNames((prev) => (prev[id] === number ? prev : { ...prev, [id]: number })),
    [],
  );
  const shipmentCtx = useMemo(() => ({ names, remember }), [names, remember]);
  const crumbs = buildBreadcrumbs(pathname, names);
  const email = session?.user?.email ?? '';

  return (
    <ShipmentNamesContext.Provider value={shipmentCtx}>
      <div className="flex min-h-screen bg-canvas text-fg">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
        >
          Skip to content
        </a>

        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex ${
            collapsed ? 'w-16' : 'w-60'
          }`}
        >
          <div
            className={`flex h-14 items-center border-b border-line px-3 ${collapsed ? 'justify-center' : ''}`}
          >
            <Link to="/dashboard" aria-label="PortChimera dashboard">
              <Logo showWordmark={!collapsed} />
            </Link>
          </div>
          <SidebarNav collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            className="m-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose size={18} aria-hidden="true" /> Collapse
              </>
            )}
          </button>
        </aside>

        <AnimatePresence>
          {drawerOpen && (
            <motion.div
              className="fixed inset-0 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-black/50"
                onClick={() => setDrawerOpen(false)}
              />
              <motion.aside
                role="dialog"
                aria-label="Navigation"
                className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface"
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'tween', duration: 0.2 }}
              >
                <div className="flex h-14 items-center justify-between border-b border-line px-3">
                  <Logo />
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-lg p-2 text-muted hover:bg-surface-2"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <SidebarNav collapsed={false} onNavigate={() => setDrawerOpen(false)} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <Breadcrumbs items={crumbs} />
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={openPalette}
                aria-label="Search (Ctrl+K)"
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                <Search size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden rounded border border-line bg-surface px-1.5 font-mono text-xs sm:inline">
                  Ctrl K
                </kbd>
              </button>
              <ThemeToggle />
              <ProfileMenu email={email} />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ShipmentNamesContext.Provider>
  );
}
