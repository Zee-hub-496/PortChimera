import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import { CommandPaletteProvider } from './components/CommandPalette.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import CrossCheck from './pages/CrossCheck.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';
import ShipmentDocuments from './pages/ShipmentDocuments.jsx';
import ShipmentRoute from './pages/ShipmentRoute.jsx';
import Shipments from './pages/Shipments.jsx';

const TITLES = [
  ['/login', 'Log in'],
  ['/register', 'Create account'],
  ['/dashboard', 'Dashboard'],
  ['/shipments', 'Shipments'],
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
            {/* Temporary until the Dashboard page and app shell arrive in Phase 3. */}
            <Route path="/dashboard" element={<Navigate to="/shipments" replace />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/shipments/:id" element={<ShipmentRoute />} />
            <Route path="/shipments/:id/documents" element={<ShipmentDocuments />} />
            <Route path="/shipments/:id/cross-check" element={<CrossCheck />} />
          </Route>
          <Route element={<PublicLayout />}>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </CommandPaletteProvider>
    </AuthProvider>
  );
}
