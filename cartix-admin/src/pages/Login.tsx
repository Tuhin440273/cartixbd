import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';

export function Login() {
  const { user, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(phone, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError('Too many attempts. Please wait a minute and try again.');
      else if (err instanceof ApiError) setError(err.errors.phone?.[0] ?? err.message);
      else setError('Cannot reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Cartix Admin</h1>
        <p className="muted" style={{ margin: 0 }}>Sign in with your phone number and password.</p>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <input id="phone" className="input" inputMode="tel" autoComplete="username" required value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
