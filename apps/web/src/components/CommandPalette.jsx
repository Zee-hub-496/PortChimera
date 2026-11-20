import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Anchor, FileText, Search, Ship } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../lib/api.js';
import { PAGE_ITEMS, buildPortItems, buildShipmentItems, searchItems } from '../lib/search.js';

const PaletteContext = createContext({ openPalette: () => {} });

/** Returns { openPalette } so headers can show a search button. */
export function useCommandPalette() {
  return useContext(PaletteContext);
}

const GROUP_ICONS = { Pages: FileText, Shipments: Ship, Ports: Anchor };
const GROUP_ORDER = ['Pages', 'Shipments', 'Ports'];

/**
 * Owns the Ctrl+K / Cmd+K palette. Ranking comes from lib/search.js, so cmdk filtering is off.
 * Must sit inside AuthProvider and the router.
 */
export function CommandPaletteProvider({ children }) {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState({ shipments: [], ports: [], loaded: false, error: false });

  const openPalette = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Shipments and ports load on first open, only for signed-in users.
  useEffect(() => {
    if (!open || !signedIn || remote.loaded) return;
    let cancelled = false;
    Promise.all([apiGet('/api/shipments'), apiGet('/api/ports')])
      .then(([shipments, ports]) => {
        if (!cancelled) setRemote({ shipments, ports, loaded: true, error: false });
      })
      .catch(() => {
        if (!cancelled) setRemote({ shipments: [], ports: [], loaded: true, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, remote.loaded]);

  // Forget the previous user's data after sign out.
  useEffect(() => {
    if (!signedIn) setRemote({ shipments: [], ports: [], loaded: false, error: false });
  }, [signedIn]);

  const results = useMemo(() => {
    const all = [
      ...PAGE_ITEMS(signedIn),
      ...buildShipmentItems(remote.shipments),
      ...buildPortItems(remote.ports),
    ];
    return searchItems(all, query, 30);
  }, [signedIn, remote, query]);

  function choose(item) {
    setOpen(false);
    setQuery('');
    navigate(item.to);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  const value = useMemo(() => ({ openPalette }), [openPalette]);

  return (
    <PaletteContext.Provider value={value}>
      {children}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[100] flex items-start justify-center bg-brand/40 px-4 pt-[15vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <Command
            shouldFilter={false}
            label="Global search"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search size={16} className="text-muted" aria-hidden="true" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                aria-label="Search shipments, ports and pages"
                placeholder={signedIn ? 'Search shipments, ports and pages' : 'Search pages'}
                className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                Esc
              </kbd>
            </div>
            <Command.List className="max-h-80 overflow-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                No results for this search.
              </Command.Empty>
              {GROUP_ORDER.map((group) => {
                const items = results.filter((r) => r.group === group);
                if (!items.length) return null;
                const Icon = GROUP_ICONS[group];
                return (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted"
                  >
                    {items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => choose(item)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-fg data-[selected=true]:bg-surface-2"
                      >
                        <Icon size={15} className="text-muted" aria-hidden="true" />
                        <span className={group === 'Shipments' ? 'font-mono' : ''}>
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="ml-auto truncate text-xs text-muted">{item.hint}</span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
              {signedIn && !remote.loaded && (
                <p role="status" className="px-3 py-2 text-xs text-muted">
                  Loading shipments and ports...
                </p>
              )}
              {signedIn && remote.error && (
                <p role="status" className="px-3 py-2 text-xs text-muted">
                  Shipments and ports could not be loaded. Pages still work.
                </p>
              )}
            </Command.List>
          </Command>
        </div>
      )}
    </PaletteContext.Provider>
  );
}
