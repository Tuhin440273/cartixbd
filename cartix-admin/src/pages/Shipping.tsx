import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fieldErrors, taka } from '../api';
import type { ShippingData } from '../api';
import { Skeleton } from '../components/Layout';
import { FieldError, Toast } from '../components/ui';
import { useToast } from '../components/hooks';

type Rate = ShippingData['rates'][number];

export function Shipping() {
  const [data, setData] = useState<ShippingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    api<ShippingData>('/shipping').then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const call = async (path: string, method: string, body: unknown, msg: string) => {
    setError(null);
    try {
      setData(await api<ShippingData>(path, { method, body }));
      showToast(msg);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={8} /></div>;

  const all = data.divisions.flatMap((d) => d.districts);
  const open = all.filter((d) => d.is_deliverable).length;
  const dhakaOnly = () => {
    const others = all.filter((d) => d.name !== 'Dhaka').map((d) => d.id);
    const dhaka = all.find((d) => d.name === 'Dhaka');
    if (!dhaka) return;
    void (async () => {
      await call('/shipping/districts/bulk', 'POST', { district_ids: [dhaka.id], is_deliverable: true }, 'Dhaka is open for delivery.');
      await call('/shipping/districts/bulk', 'POST', { district_ids: others, is_deliverable: false }, 'Delivery is now limited to Dhaka district.');
    })();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shipping &amp; Locations</h1>
          <span className="muted">Delivery charges per zone and which districts you deliver to. Changes apply to new orders at once.</span>
        </div>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}

      <section className="card" aria-labelledby="rates-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 id="rates-title" style={{ margin: 0 }}>Delivery charges</h2>
        <p className="muted" style={{ margin: 0 }}>Charge = base fee for the first kilogram + the per-kg fee for each extra kilogram. Courier integration is not connected; enter the rates your courier charges you.</p>
        {data.rates.map((r) => <RateForm key={r.zone} rate={r} onSave={(body) => call(`/shipping/rates/${r.zone}`, 'PUT', body, `${r.label} rates saved.`)} />)}
      </section>

      <section className="card" aria-labelledby="cov-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="page-head">
          <div>
            <h2 id="cov-title" style={{ margin: 0 }}>Delivery coverage</h2>
            <span className="muted">{open} of {all.length} districts open. Customers can only choose open districts at checkout.</span>
          </div>
          <span className="actions">
            <button type="button" className="btn btn-sm" onClick={dhakaOnly}>Dhaka district only</button>
            <button type="button" className="btn btn-sm" onClick={() => void call('/shipping/districts/bulk', 'POST', { district_ids: all.map((d) => d.id), is_deliverable: true }, 'All districts are open for delivery.')}>Open all districts</button>
          </span>
        </div>
        {data.divisions.map((div) => {
          const ids = div.districts.map((d) => d.id);
          const openHere = div.districts.filter((d) => d.is_deliverable).length;
          return (
            <fieldset key={div.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
              <legend style={{ fontWeight: 700, padding: '0 6px' }}>{div.name} <span className="muted" style={{ fontWeight: 400 }}>({openHere}/{div.districts.length})</span></legend>
              <div className="actions" style={{ marginBottom: 8 }}>
                <button type="button" className="btn btn-sm" disabled={openHere === ids.length} onClick={() => void call('/shipping/districts/bulk', 'POST', { district_ids: ids, is_deliverable: true }, `${div.name} division opened.`)}>Open all</button>
                <button type="button" className="btn btn-sm" disabled={openHere === 0} onClick={() => void call('/shipping/districts/bulk', 'POST', { district_ids: ids, is_deliverable: false }, `${div.name} division closed.`)}>Close all</button>
              </div>
              <div className="district-grid">
                {div.districts.map((d) => (
                  <label key={d.id} className="switch" title={data.zones[d.shipping_zone]}>
                    <input type="checkbox" checked={d.is_deliverable}
                      onChange={(e) => void call(`/shipping/districts/${d.id}`, 'PUT', { is_deliverable: e.target.checked, shipping_zone: d.shipping_zone },
                        `${d.name} ${e.target.checked ? 'opened' : 'closed'} for delivery.`)} />
                    <span>{d.name} <span className="muted" style={{ fontSize: 12 }}>{data.zones[d.shipping_zone]}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </section>
      <Toast message={toast} />
    </>
  );
}

function RateForm({ rate, onSave }: { rate: Rate; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({
    base_fee: rate.base_fee ? String(Number(rate.base_fee)) : '',
    per_kg_fee: rate.per_kg_fee ? String(Number(rate.per_kg_fee)) : '0',
    min_days: String(rate.min_days ?? 1),
    max_days: String(rate.max_days ?? 3),
    is_active: rate.is_active,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      await onSave({ ...f, min_days: Number(f.min_days), max_days: Number(f.max_days) });
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  };

  return (
    <form onSubmit={submit} className="form-grid" style={{ alignItems: 'end', borderTop: '1px solid var(--line)', paddingTop: 12 }} aria-label={`${rate.label} delivery rates`}>
      <div>
        <strong>{rate.label}</strong>
        <br /><span className="muted" style={{ fontSize: 13 }}>{rate.deliverable_districts} of {rate.districts} districts open{rate.base_fee ? ` · now ${taka(rate.base_fee)}` : ''}</span>
      </div>
      <div className="field"><label htmlFor={`bf-${rate.zone}`}>Base fee (Tk)</label><input id={`bf-${rate.zone}`} className="input" inputMode="decimal" value={f.base_fee} onChange={set('base_fee')} /><FieldError message={errors.base_fee} /></div>
      <div className="field"><label htmlFor={`kg-${rate.zone}`}>Per extra kg (Tk)</label><input id={`kg-${rate.zone}`} className="input" inputMode="decimal" value={f.per_kg_fee} onChange={set('per_kg_fee')} /><FieldError message={errors.per_kg_fee} /></div>
      <div className="field"><label htmlFor={`mn-${rate.zone}`}>Days (from)</label><input id={`mn-${rate.zone}`} className="input" inputMode="numeric" value={f.min_days} onChange={set('min_days')} /><FieldError message={errors.min_days} /></div>
      <div className="field"><label htmlFor={`mx-${rate.zone}`}>Days (to)</label><input id={`mx-${rate.zone}`} className="input" inputMode="numeric" value={f.max_days} onChange={set('max_days')} /><FieldError message={errors.max_days} /></div>
      <label className="switch" style={{ minHeight: 44 }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Zone active</label>
      <div><button type="submit" className="btn btn-sm btn-primary">Save<span className="sr-only"> {rate.label}</span></button></div>
    </form>
  );
}
