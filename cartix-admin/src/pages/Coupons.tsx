import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fieldErrors, taka } from '../api';
import type { Coupon } from '../api';
import { Skeleton } from '../components/Layout';
import { ConfirmButton, FieldError, Toast } from '../components/ui';
import { dhakaDate, useToast } from '../components/hooks';

const STATE: Record<Coupon['state'], { label: string; css: string }> = {
  live: { label: 'Live', css: 'active' },
  scheduled: { label: 'Scheduled', css: 'confirmed' },
  inactive: { label: 'Off', css: 'archived' },
  expired: { label: 'Expired', css: 'returned' },
  used_up: { label: 'Used up', css: 'cancelled' },
};

/** "2026-10-24T10:00:00+00:00" to the value of a datetime-local input in Dhaka time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 6 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function describe(c: Coupon): string {
  if (c.type === 'free_shipping') return 'Free delivery';
  if (c.type === 'percent') return `${Number(c.value)}% off${c.max_discount ? `, up to ${taka(c.max_discount)}` : ''}`;
  return `${taka(c.value)} off`;
}

export function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    api<{ data: Coupon[] }>('/coupons').then((r) => setCoupons(r.data)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async (c: Coupon) => {
    setError(null);
    try {
      await api(`/coupons/${c.id}`, { method: 'DELETE' });
      showToast(`Coupon ${c.code} deleted.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Coupons &amp; Promotions</h1>
          <span className="muted">Customers enter the code at checkout. Discounts are checked and calculated by the server.</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ New coupon</button>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {editing && <CouponForm coupon={editing === 'new' ? null : editing} onDone={(msg) => { setEditing(null); if (msg) { showToast(msg); load(); } }} />}
      <section className="card">
        {!coupons ? <Skeleton rows={5} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Offer</th><th>Minimum order</th><th>Valid</th><th>Used</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="num"><strong>{c.code}</strong></td>
                    <td>{describe(c)}</td>
                    <td className="num">{Number(c.min_order_amount) > 0 ? taka(c.min_order_amount) : 'None'}</td>
                    <td>{c.starts_at || c.ends_at ? `${dhakaDate(c.starts_at) || 'Now'} to ${dhakaDate(c.ends_at) || 'no end'}` : 'Always'}</td>
                    <td className="num">{c.times_used}{c.usage_limit ? ` / ${c.usage_limit}` : ''}<br /><span className="muted" style={{ fontSize: 13 }}>{taka(c.discount_given)} given</span></td>
                    <td><span className={`badge badge-${STATE[c.state].css}`}>{STATE[c.state].label}</span></td>
                    <td>
                      <span className="actions">
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(c)}>Edit<span className="sr-only"> {c.code}</span></button>
                        {c.times_used === 0 && <ConfirmButton label="Delete" confirmLabel="Delete" onConfirm={() => void remove(c)} />}
                      </span>
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && <tr><td colSpan={7} className="muted">No coupons yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Toast message={toast} />
    </>
  );
}

function CouponForm({ coupon, onDone }: { coupon: Coupon | null; onDone: (msg: string | null) => void }) {
  const [f, setF] = useState({
    code: coupon?.code ?? '',
    type: coupon?.type ?? 'percent',
    value: coupon && coupon.type !== 'free_shipping' ? String(Number(coupon.value)) : '',
    min_order_amount: coupon && Number(coupon.min_order_amount) > 0 ? String(Number(coupon.min_order_amount)) : '',
    max_discount: coupon?.max_discount ? String(Number(coupon.max_discount)) : '',
    usage_limit: coupon?.usage_limit ? String(coupon.usage_limit) : '',
    per_user_limit: coupon?.per_user_limit ? String(coupon.per_user_limit) : '1',
    starts_at: toLocalInput(coupon?.starts_at ?? null),
    ends_at: toLocalInput(coupon?.ends_at ?? null),
    is_active: coupon?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const n = (v: string) => (v.trim() === '' ? null : v.trim());
    try {
      await api(coupon ? `/coupons/${coupon.id}` : '/coupons', {
        method: coupon ? 'PUT' : 'POST',
        body: {
          code: f.code, type: f.type, value: f.type === 'free_shipping' ? null : n(f.value),
          min_order_amount: n(f.min_order_amount), max_discount: f.type === 'percent' ? n(f.max_discount) : null,
          usage_limit: n(f.usage_limit), per_user_limit: n(f.per_user_limit),
          starts_at: n(f.starts_at), ends_at: n(f.ends_at), is_active: f.is_active,
        },
      });
      onDone(coupon ? 'Coupon saved.' : 'Coupon created.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-label={coupon ? `Edit ${coupon.code}` : 'New coupon'}>
      <h2 style={{ margin: 0 }}>{coupon ? `Edit ${coupon.code}` : 'New coupon'}</h2>
      {message && <div className="alert" role="alert">{message}</div>}
      {coupon && coupon.times_used > 0 && <p className="muted" style={{ margin: 0 }}>This coupon has been used, so its code cannot change. Turn it off to stop new use.</p>}
      <div className="form-grid">
        <div className="field"><label htmlFor="cp-code">Code</label><input id="cp-code" className="input" style={{ textTransform: 'uppercase' }} required maxLength={50} value={f.code} onChange={set('code')} placeholder="EID10" /><FieldError message={errors.code} /></div>
        <div className="field">
          <label htmlFor="cp-type">Type</label>
          <select id="cp-type" className="input" value={f.type} onChange={set('type')}>
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
            <option value="free_shipping">Free delivery</option>
          </select>
        </div>
        {f.type !== 'free_shipping' && (
          <div className="field"><label htmlFor="cp-value">{f.type === 'percent' ? 'Percent (%)' : 'Amount (Tk)'}</label><input id="cp-value" className="input" inputMode="decimal" value={f.value} onChange={set('value')} /><FieldError message={errors.value} /></div>
        )}
        {f.type === 'percent' && (
          <div className="field"><label htmlFor="cp-max">Maximum discount (Tk, optional)</label><input id="cp-max" className="input" inputMode="decimal" value={f.max_discount} onChange={set('max_discount')} /><FieldError message={errors.max_discount} /></div>
        )}
        <div className="field"><label htmlFor="cp-min">Minimum order (Tk, optional)</label><input id="cp-min" className="input" inputMode="decimal" value={f.min_order_amount} onChange={set('min_order_amount')} /><FieldError message={errors.min_order_amount} /></div>
        <div className="field"><label htmlFor="cp-limit">Total uses allowed (optional)</label><input id="cp-limit" className="input" inputMode="numeric" value={f.usage_limit} onChange={set('usage_limit')} /><FieldError message={errors.usage_limit} /></div>
        <div className="field"><label htmlFor="cp-per">Uses per phone number (optional)</label><input id="cp-per" className="input" inputMode="numeric" value={f.per_user_limit} onChange={set('per_user_limit')} /><FieldError message={errors.per_user_limit} /></div>
        <div className="field"><label htmlFor="cp-start">Starts (Dhaka time, optional)</label><input id="cp-start" className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /><FieldError message={errors.starts_at} /></div>
        <div className="field"><label htmlFor="cp-end">Ends (Dhaka time, optional)</label><input id="cp-end" className="input" type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /><FieldError message={errors.ends_at} /></div>
      </div>
      <label className="switch"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Coupon is on</label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save coupon'}</button>
        <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
