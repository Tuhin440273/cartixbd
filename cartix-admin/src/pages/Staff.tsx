import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, dhakaDateTime, fieldErrors } from '../api';
import type { StaffMember } from '../api';
import { useAuth } from '../auth';
import { Skeleton } from '../components/Layout';
import { FieldError, Toast } from '../components/ui';
import { useToast } from '../components/hooks';

type RoleOption = { value: string; label: string; description: string };

export function Staff() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    api<{ data: StaffMember[]; roles: RoleOption[] }>('/staff').then((r) => { setStaff(r.data); setRoles(r.roles); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const roleLabel = (v: string | null) => roles.find((r) => r.value === v)?.label ?? v ?? '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Staff &amp; Permissions</h1>
          <span className="muted">Blocking someone or changing their role signs them out immediately.</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ Add staff member</button>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}

      <section className="card" aria-labelledby="roles-title">
        <h2 id="roles-title">What each role can do</h2>
        <dl className="kv">{roles.map((r) => <Fragment key={r.value}><dt>{r.label}</dt><dd style={{ fontWeight: 400 }}>{r.description}</dd></Fragment>)}</dl>
      </section>

      {editing && <StaffForm member={editing === 'new' ? null : editing} roles={roles} isSelf={editing !== 'new' && editing.id === user?.id}
        onDone={(msg) => { setEditing(null); if (msg) { showToast(msg); load(); } }} />}
      {resetting && <PasswordForm member={resetting} onDone={(msg) => { setResetting(null); if (msg) showToast(msg); }} />}

      <section className="card">
        {!staff ? <Skeleton rows={4} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {staff.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong>{m.id === user?.id && <span className="muted"> (you)</span>}</td>
                    <td className="num">{m.phone}</td>
                    <td>{roleLabel(m.role)}</td>
                    <td>{m.status === 'active' ? <span className="badge badge-active">Active</span> : <span className="badge badge-cancelled">Blocked</span>}</td>
                    <td className="num">{m.last_login_at ? dhakaDateTime(m.last_login_at) : <span className="muted">Never</span>}</td>
                    <td>
                      <span className="actions">
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(m)}>Edit<span className="sr-only"> {m.name}</span></button>
                        <button type="button" className="btn btn-sm" onClick={() => setResetting(m)}>Set password<span className="sr-only"> for {m.name}</span></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Toast message={toast} />
    </>
  );
}

function StaffForm({ member, roles, isSelf, onDone }: { member: StaffMember | null; roles: RoleOption[]; isSelf: boolean; onDone: (msg: string | null) => void }) {
  const [f, setF] = useState({ name: member?.name ?? '', phone: member?.phone ?? '', email: member?.email ?? '', role: member?.role ?? 'order_manager', status: member?.status ?? 'active', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      if (member) {
        await api(`/staff/${member.id}`, { method: 'PUT', body: { name: f.name, role: f.role, status: f.status } });
      } else {
        await api('/staff', { method: 'POST', body: { name: f.name, phone: f.phone, email: f.email || null, role: f.role, password: f.password } });
      }
      onDone(member ? 'Staff member saved.' : 'Staff member added. Share the password with them privately.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-label={member ? `Edit ${member.name}` : 'Add staff member'}>
      <h2 style={{ margin: 0 }}>{member ? `Edit ${member.name}` : 'Add staff member'}</h2>
      {message && <div className="alert" role="alert">{message}</div>}
      <div className="form-grid">
        <div className="field"><label htmlFor="st-name">Name</label><input id="st-name" className="input" required maxLength={150} value={f.name} onChange={set('name')} /><FieldError message={errors.name} /></div>
        {!member && <div className="field"><label htmlFor="st-phone">Mobile number (used to sign in)</label><input id="st-phone" className="input" type="tel" required value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" /><FieldError message={errors.phone} /></div>}
        {!member && <div className="field"><label htmlFor="st-email">Email (optional)</label><input id="st-email" className="input" type="email" value={f.email} onChange={set('email')} /><FieldError message={errors.email} /></div>}
        <div className="field">
          <label htmlFor="st-role">Role</label>
          <select id="st-role" className="input" value={f.role} disabled={isSelf} onChange={set('role')}>
            {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <FieldError message={errors.role} />
        </div>
        {member && (
          <div className="field">
            <label htmlFor="st-status">Status</label>
            <select id="st-status" className="input" value={f.status} disabled={isSelf} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="blocked">Blocked (cannot sign in)</option>
            </select>
          </div>
        )}
        {!member && <div className="field"><label htmlFor="st-pass">Password</label><input id="st-pass" className="input" type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} aria-describedby="st-pass-hint" /><span id="st-pass-hint" className="muted" style={{ fontSize: 13 }}>At least 10 characters with letters and numbers.</span><FieldError message={errors.password} /></div>}
      </div>
      {isSelf && <p className="muted" style={{ margin: 0 }}>You cannot change your own role or block yourself.</p>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}

function PasswordForm({ member, onDone }: { member: StaffMember; onDone: (msg: string | null) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(`/staff/${member.id}/password`, { method: 'PUT', body: { password } });
      onDone(`Password changed for ${member.name}.`);
    } catch (err) {
      setError(fieldErrors(err).password ?? (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={`Set password for ${member.name}`}>
      <h2 style={{ margin: 0 }}>New password for {member.name}</h2>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="pw-new">New password</label>
        <input id="pw-new" className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="muted" style={{ fontSize: 13 }}>At least 10 characters with letters and numbers. Their other sign-ins end.</span>
        <FieldError message={error} />
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
        <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
