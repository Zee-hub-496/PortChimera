import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import PasswordField, { INPUT_CLASS } from '../components/PasswordField.jsx';
import { Button } from '../components/ui.jsx';
import AuthSplit from '../layouts/AuthSplit.jsx';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = location.state?.from ?? '/dashboard';

  if (session) return <Navigate to={target} replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      toast.success('Signed in');
      navigate(target, { replace: true });
    }
  }

  return (
    <AuthSplit
      title="Log in"
      subtitle="Welcome back. Sign in to see your shipments."
      footer={
        <p>
          New here?{' '}
          <Link to="/register" className="font-semibold text-accent underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="login-email" className="font-semibold text-fg">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Log in'}
        </Button>
        <p className="text-xs text-muted">
          Test accounts for this project: alice@example.com and bob@example.com. Use the password
          you set in your own Supabase project.
        </p>
      </form>
    </AuthSplit>
  );
}
