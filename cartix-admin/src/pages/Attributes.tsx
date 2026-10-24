import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fieldErrors } from '../api';
import type { AttributeGroup } from '../api';
import { Skeleton } from '../components/Layout';
import { ConfirmButton, FieldError, Toast } from '../components/ui';
import { useToast } from '../components/hooks';

type Value = AttributeGroup['values'][number];

/** Sizes and colors that product variants are built from. */
export function Attributes() {
  const [groups, setGroups] = useState<AttributeGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    api<{ data: AttributeGroup[] }>('/attributes').then((r) => setGroups(r.data)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Attributes</h1>
          <span className="muted">Sizes and colors used when creating product variants. Values used by a product cannot be deleted.</span>
        </div>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {!groups ? <div className="card"><Skeleton rows={6} /></div> : groups.map((g) => (
        <AttributeCard key={g.id} group={g} onChange={(msg) => { showToast(msg); load(); }} />
      ))}
      <Toast message={toast} />
    </>
  );
}

function AttributeCard({ group, onChange }: { group: AttributeGroup; onChange: (msg: string) => void }) {
  const isColor = group.code === 'color';
  const [editing, setEditing] = useState<Value | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (v: Value) => {
    setError(null);
    try {
      await api(`/attribute-values/${v.id}`, { method: 'DELETE' });
      onChange(`"${v.value}" deleted.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card" aria-labelledby={`attr-${group.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="page-head">
        <h2 id={`attr-${group.id}`} style={{ margin: 0 }}>{group.name}</h2>
        <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>+ Add {group.name.toLowerCase()}</button>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {editing && <ValueForm group={group} value={editing === 'new' ? null : editing} onDone={(msg) => { setEditing(null); if (msg) onChange(msg); }} />}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Value</th>{isColor && <th>Color</th>}<th>Used by variants</th><th>Order</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {group.values.map((v) => (
              <tr key={v.id}>
                <td><strong>{v.value}</strong></td>
                {isColor && <td><span className="chip" style={{ minHeight: 30, cursor: 'default' }}><span className="swatch" style={{ background: v.color_hex ?? 'transparent' }} aria-hidden="true" />{v.color_hex}</span></td>}
                <td className="num">{v.variant_count}</td>
                <td className="num">{v.sort_order}</td>
                <td>
                  <span className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(v)}>Edit<span className="sr-only"> {v.value}</span></button>
                    {v.variant_count === 0 && <ConfirmButton label="Delete" confirmLabel="Delete" onConfirm={() => void remove(v)} />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ValueForm({ group, value, onDone }: { group: AttributeGroup; value: Value | null; onDone: (msg: string | null) => void }) {
  const isColor = group.code === 'color';
  const [text, setText] = useState(value?.value ?? '');
  const [hex, setHex] = useState(value?.color_hex ?? '#1E2228');
  const [sort, setSort] = useState(value ? String(value.sort_order) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = { value: text.trim(), color_hex: isColor ? hex.toUpperCase() : null, sort_order: sort === '' ? null : Number(sort) };
    try {
      await api(value ? `/attribute-values/${value.id}` : `/attributes/${group.id}/values`, { method: value ? 'PUT' : 'POST', body });
      onDone(value ? 'Value saved.' : 'Value added.');
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { value: (err as Error).message });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="form-grid" style={{ alignItems: 'end', background: 'var(--surface-2)', padding: 12, borderRadius: 10 }}
      aria-label={value ? `Edit ${value.value}` : `New ${group.name.toLowerCase()}`}>
      <div className="field"><label htmlFor={`v-${group.id}`}>{group.name}</label><input id={`v-${group.id}`} className="input" required maxLength={100} value={text} onChange={(e) => setText(e.target.value)} placeholder={isColor ? 'Maroon' : 'XL'} /><FieldError message={errors.value} /></div>
      {isColor && (
        <div className="field">
          <label htmlFor={`hex-${group.id}`}>Color</label>
          <input id={`hex-${group.id}`} className="input" type="color" value={hex} onChange={(e) => setHex(e.target.value)} style={{ padding: 4 }} />
          <FieldError message={errors.color_hex} />
        </div>
      )}
      <div className="field"><label htmlFor={`s-${group.id}`}>Order (optional)</label><input id={`s-${group.id}`} className="input" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} /></div>
      <div className="actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-sm" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
