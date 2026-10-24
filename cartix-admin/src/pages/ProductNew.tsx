import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { Meta } from '../api';
import { Skeleton } from '../components/Layout';

export function ProductNew() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState({
    name: '', category_id: '', brand_id: '', description: '', price: '', compare_at_price: '', cost_price: '', weight_grams: '500',
    initial_stock: '10', short_description: '', publish: true,
  });
  const [sizes, setSizes] = useState<number[]>([]);
  const [colors, setColors] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Meta>('/meta').then(setMeta).catch((e: Error) => setError(e.message));
  }, []);

  const toggle = (list: number[], set: (v: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const variantCount = Math.max(1, sizes.length) * Math.max(1, colors.length);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const r = await api<{ data: { id: number } }>('/products', {
        method: 'POST',
        body: {
          ...form,
          category_id: Number(form.category_id),
          brand_id: form.brand_id ? Number(form.brand_id) : null,
          description: form.description || null,
          compare_at_price: form.compare_at_price || null,
          cost_price: form.cost_price || null,
          weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
          initial_stock: Number(form.initial_stock),
          size_value_ids: sizes,
          color_value_ids: colors,
        },
      });
      navigate(`/products/${r.data.id}`, { state: { created: true } });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setError(err.message);
      } else setError('The product could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (k: string) => errors[k]?.[0] && <span className="error-text">{errors[k][0]}</span>;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  if (!meta) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={8} /></div>;

  const parents = meta.categories.filter((c) => c.parent_id === null);

  return (
    <>
      <div className="page-head"><h1>New product</h1></div>
      <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && <div className="alert" role="alert">{error}</div>}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Product name</label>
            <input id="name" className="input" required maxLength={200} value={form.name} onChange={set('name')} placeholder="Fleece Hoodie" />
            {fieldError('name')}
          </div>
          <div className="field">
            <label htmlFor="cat">Category</label>
            <select id="cat" className="input" required value={form.category_id} onChange={set('category_id')}>
              <option value="">Choose a category</option>
              {parents.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name} (all)</option>
                  {meta.categories.filter((c) => c.parent_id === p.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
            {fieldError('category_id')}
          </div>
          <div className="field">
            <label htmlFor="brand">Brand (optional)</label>
            <select id="brand" className="input" value={form.brand_id} onChange={set('brand_id')}>
              <option value="">No brand</option>
              {meta.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="price">Selling price (Tk)</label>
            <input id="price" className="input" required inputMode="decimal" value={form.price} onChange={set('price')} placeholder="1250" />
            {fieldError('price')}
          </div>
          <div className="field">
            <label htmlFor="cmp">Regular price before discount (optional)</label>
            <input id="cmp" className="input" inputMode="decimal" value={form.compare_at_price} onChange={set('compare_at_price')} placeholder="1550" />
            {fieldError('compare_at_price')}
          </div>
          <div className="field">
            <label htmlFor="cost">Cost price (private)</label>
            <input id="cost" className="input" inputMode="decimal" value={form.cost_price} onChange={set('cost_price')} placeholder="750" />
            {fieldError('cost_price')}
          </div>
          <div className="field">
            <label htmlFor="weight">Weight (grams), used for delivery charges</label>
            <input id="weight" className="input" inputMode="numeric" value={form.weight_grams} onChange={set('weight_grams')} />
            {fieldError('weight_grams')}
          </div>
        </div>

        <div className="field">
          <span className="label">Sizes</span>
          <div className="chips" role="group" aria-label="Sizes">
            {meta.sizes.map((s) => (
              <button key={s.id} type="button" className="chip" aria-pressed={sizes.includes(s.id)} onClick={() => toggle(sizes, setSizes, s.id)}>{s.value}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Colors</span>
          <div className="chips" role="group" aria-label="Colors">
            {meta.colors.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={colors.includes(c.id)} onClick={() => toggle(colors, setColors, c.id)}>
                <span className="swatch" style={{ background: c.color_hex ?? 'transparent' }} aria-hidden="true" />{c.value}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="stock">Opening stock per variant</label>
            <input id="stock" className="input" inputMode="numeric" value={form.initial_stock} onChange={set('initial_stock')} />
            {fieldError('initial_stock')}
          </div>
          <div className="field">
            <span className="label">Variants to create</span>
            <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{variantCount}</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="desc">Short description</label>
          <textarea id="desc" className="input" maxLength={500} value={form.short_description} onChange={set('short_description')} />
        </div>
        <div className="field">
          <label htmlFor="fulldesc">Full description (optional)</label>
          <textarea id="fulldesc" className="input" maxLength={20000} value={form.description} onChange={set('description')}
            placeholder="Fabric, fit, care instructions, size guide" />
        </div>
        <p className="muted" style={{ margin: 0 }}>After saving you can add photos, change prices per variant and set the cost price used for profit reports.</p>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} />
          Publish on the storefront as soon as it is saved
        </label>

        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
          <button className="btn" type="button" onClick={() => navigate('/products')}>Cancel</button>
        </div>
      </form>
    </>
  );
}
