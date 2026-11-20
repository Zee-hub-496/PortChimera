import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import ShipmentRoute from './pages/ShipmentRoute.jsx';
import Shipments from './pages/Shipments.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/shipments"
          element={
            <RequireAuth>
              <Shipments />
            </RequireAuth>
          }
        />
        <Route
          path="/shipments/:id"
          element={
            <RequireAuth>
              <ShipmentRoute />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
