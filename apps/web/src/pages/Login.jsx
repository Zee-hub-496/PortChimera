import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = location.state?.from ?? '/shipments';

  if (session) return <Navigate to={target} replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) setError(signInError.message);
    else navigate(target, { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-3xl font-bold">Sign in</h1>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded bg-slate-800 p-2 text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded bg-slate-800 p-2 text-slate-100"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-sky-600 p-2 font-semibold hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="text-xs text-slate-400">
          Test accounts for this project: alice@example.com and bob@example.com. Use the password
          you set in your own Supabase project.
        </p>
      </form>
    </main>
  );
}
