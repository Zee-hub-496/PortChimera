import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import PasswordField, { INPUT_CLASS } from '../components/PasswordField.jsx';
import { Button } from '../components/ui.jsx';
import AuthSplit from '../layouts/AuthSplit.jsx';
import { supabase } from '../lib/supabase.js';
import { describeSignupError, validateSignupForm } from '../lib/signupForm.js';

export default function Register() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState('');

  if (session) return <Navigate to="/dashboard" replace />;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(event) {
    event.preventDefault();
    const result = validateSignupForm(form);
    setErrors(result.errors);
    setSubmitError('');
    if (!result.valid) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: result.value.email,
      password: result.value.password,
    });
    setBusy(false);
    if (error) {
      setSubmitError(describeSignupError(error));
    } else if (data.session) {
      navigate('/dashboard', { replace: true });
    } else {
      setCheckEmail(result.value.email);
    }
  }

  if (checkEmail) {
    return (
      <AuthSplit title="Check your email">
        <div className="flex gap-3 rounded-xl border border-line bg-surface p-4">
          <Mail size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm text-fg">
            We sent a confirmation link to <span className="font-mono">{checkEmail}</span>. Open it,
            then{' '}
            <Link to="/login" className="font-semibold text-accent underline">
              log in
            </Link>
            .
          </p>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit
      title="Create your account"
      subtitle="Add shipments and documents. You only see your own."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent underline">
            Log in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="register-email" className="font-semibold text-fg">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            className={INPUT_CLASS}
          />
          {errors.email && (
            <p id="register-email-error" className="text-xs text-danger">
              {errors.email}
            </p>
          )}
        </div>
        <PasswordField
          label="Password"
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          error={errors.password}
        />
        <PasswordField
          label="Confirm password"
          value={form.confirm}
          onChange={set('confirm')}
          autoComplete="new-password"
          error={errors.confirm}
        />
        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthSplit>
  );
}
