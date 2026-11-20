import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Wraps a page that needs a signed-in user. Others are sent to /login.
export default function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <p role="status" className="min-h-screen bg-canvas p-6 text-muted">
        Loading...
      </p>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
