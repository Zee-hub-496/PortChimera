import { useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import { CommandPaletteProvider } from './components/CommandPalette.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import ShipmentLayout from './layouts/ShipmentLayout.jsx';
import AlertsHub from './pages/AlertsHub.jsx';
import CrossCheck from './pages/CrossCheck.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DocumentsHub from './pages/DocumentsHub.jsx';
import GlobalMap from './pages/GlobalMap.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';
import Settings from './pages/Settings.jsx';
import ShipmentOverview from './pages/ShipmentOverview.jsx';
import ShipmentDocuments from './pages/ShipmentDocuments.jsx';
import ShipmentRoute from './pages/ShipmentRoute.jsx';
import Shipments from './pages/Shipments.jsx';

const TITLES = [
  ['/login', 'Log in'],
  ['/register', 'Create account'],
  ['/dashboard', 'Dashboard'],
  ['/shipments', 'Shipments'],
  ['/map', 'Global Map'],
  ['/documents', 'Documents'],
  ['/alerts', 'Alerts'],
  ['/settings', 'Settings'],
];

// Scrolls to #anchors after navigation and to the top on a new page. Sets the tab title.
function RouteEffects() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const hit = TITLES.find(([prefix]) => pathname.startsWith(prefix));
    document.title = hit ? `${hit[1]} | PortChimera` : 'PortChimera';
  }, [pathname]);

  useEffect(() => {
    if (hash) {
      // Wait a frame so lazy sections exist before scrolling.
      const id = decodeURIComponent(hash.slice(1));
      const frame = requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
      return () => cancelAnimationFrame(frame);
    }
    window.scrollTo(0, 0);
    return undefined;
  }, [pathname, hash]);

  return null;
}

function Protected() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CommandPaletteProvider>
        <RouteEffects />
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<Protected />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/shipments" element={<Shipments />} />
              <Route path="/shipments/:id" element={<ShipmentLayout />}>
                <Route index element={<ShipmentOverview />} />
                <Route path="documents" element={<ShipmentDocuments />} />
                <Route path="cross-check" element={<CrossCheck />} />
                <Route path="route" element={<ShipmentRoute />} />
              </Route>
              <Route path="/map" element={<GlobalMap />} />
              <Route path="/documents" element={<DocumentsHub />} />
              <Route path="/alerts" element={<AlertsHub />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route element={<PublicLayout />}>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </CommandPaletteProvider>
    </AuthProvider>
  );
}
