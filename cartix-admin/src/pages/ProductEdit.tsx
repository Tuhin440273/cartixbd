import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, fieldErrors, taka } from '../api';
import type { Meta, ProductDetail } from '../api';
import { useAuth } from '../auth';
import { Skeleton, StatusBadge } from '../components/Layout';
import { ConfirmButton, FieldError, Toast } from '../components/ui';
import { useToast } from '../components/hooks';
import { ProductPhotos } from './ProductPhotos';

type Variant = ProductDetail['variants'][number];


export function ProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const created = (location.state as { created?: boolean } | null)?.created === true;

  const load = useCallback(() => {
    api<{ data: ProductDetail }>(`/products/${id}`).then((r) => setProduct(r.data)).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Meta>('/meta').then(setMeta).catch((e: Error) => setError(e.message));
  }, []);

  if (!product || !meta) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={8} /></div>;

  const manage = can('products.manage');

  const remove = async () => {
    try {
      await api(`/products/${product.id}`, { method: 'DELETE' });
      navigate('/products');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/products" className="muted">← Products</Link>
          <h1>{product.name}</h1>
          <span className="actions" style={{ marginTop: 6 }}>
            <StatusBadge status={product.status} label={product.status_label} />
            <span className="muted">{product.sold_count} sold</span>
          </span>
        </div>
      </div>

      {created && <div className="notice" role="status">Product saved. Now add photos so customers can see it.</div>}
      {error && <div className="alert" role="alert">{error}</div>}

      <DetailsForm product={product} meta={meta} disabled={!manage} onSaved={(p) => { setProduct(p); setError(null); showToast('Product details saved.'); }} />
      <VariantsSection product={product} meta={meta} manage={manage} onChange={(p, msg) => { setProduct(p); showToast(msg); }} />
      <ProductPhotos product={product} meta={meta} manage={manage} onChange={(p, msg) => { setProduct(p); showToast(msg); }} />

      {manage && (
        <section className="card" aria-labelledby="danger-title">
          <h2 id="danger-title">Remove product</h2>
          {product.has_orders ? (
            <p className="muted">
              This product has orders, so it is kept for the order records. Set its status to <strong>Archived</strong> to hide it from the shop.
            </p>
          ) : (
            <div className="actions">
              <p className="muted" style={{ margin: 0 }}>This product has never been ordered. Deleting hides it everywhere; its stock history is kept.</p>
              <ConfirmButton label="Delete product" confirmLabel="Yes, delete" onConfirm={() => void remove()} />
            </div>
          )}
        </section>
      )}
      <Toast message={toast} />
    </>
  );
}

function DetailsForm({ product, meta, disabled, onSaved }: { product: ProductDetail; meta: Meta; disabled: boolean; onSaved: (p: ProductDetail) => void }) {
  const [form, setForm] = useState({
    name: product.name,
    slug: product.slug,
    category_id: String(product.category_id),
    brand_id: product.brand_id ? String(product.brand_id) : '',
    status: product.status,
    is_featured: product.is_featured,
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    meta_title: product.meta_title ?? '',
    meta_description: product.meta_description ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const r = await api<{ data: ProductDetail }>(`/products/${product.id}`, {
        method: 'PUT',
        body: {
          ...form,
          category_id: Number(form.category_id),
          brand_id: form.brand_id ? Number(form.brand_id) : null,
          slug: form.slug || null,
          short_description: form.short_description || null,
          description: form.description || null,
          meta_title: form.meta_title || null,
          meta_description: form.meta_description || null,
        },
      });
      onSaved(r.data);
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const parents = meta.categories.filter((c) => c.parent_id === null);

  return (
    <form className="card" onSubmit={submit} aria-labelledby="details-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="details-title">Details</h2>
      {message && <div className="alert" role="alert">{message}</div>}
      <fieldset disabled={disabled || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Product name</label>
            <input id="name" className="input" required maxLength={200} value={form.name} onChange={set('name')} />
            <FieldError message={errors.name} />
          </div>
          <div className="field">
            <label htmlFor="slug">URL name</label>
            <input id="slug" className="input" maxLength={220} value={form.slug} onChange={set('slug')} aria-describedby="slug-hint" />
            <span id="slug-hint" className="muted" style={{ fontSize: 13 }}>Shop address: /product/{form.slug || '...'}</span>
            <FieldError message={errors.slug} />
          </div>
          <div className="field">
            <label htmlFor="cat">Category</label>
            <select id="cat" className="input" value={form.category_id} onChange={set('category_id')}>
              {parents.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name} (all)</option>
                  {meta.categories.filter((c) => c.parent_id === p.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
            <FieldError message={errors.category_id} />
          </div>
          <div className="field">
            <label htmlFor="brand">Brand</label>
            <select id="brand" className="input" value={form.brand_id} onChange={set('brand_id')}>
              <option value="">No brand</option>
              {meta.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" className="input" value={form.status} onChange={set('status')}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active (visible in the shop)</option>
              <option value="archived">Archived (hidden, kept for records)</option>
            </select>
            <FieldError message={errors.status} />
          </div>
          <label className="switch" style={{ alignSelf: 'end', minHeight: 44 }}>
            <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />
            Show in "Featured" on the home page
          </label>
        </div>
        <div className="field">
          <label htmlFor="short">Short description</label>
          <textarea id="short" className="input" maxLength={500} value={form.short_description} onChange={set('short_description')} />
          <FieldError message={errors.short_description} />
        </div>
        <div className="field">
          <label htmlFor="desc">Full description</label>
          <textarea id="desc" className="input" style={{ minHeight: 140 }} maxLength={20000} value={form.description} onChange={set('description')} />
          <FieldError message={errors.description} />
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Search engine settings (optional)</summary>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="mt">Page title</label>
              <input id="mt" className="input" maxLength={200} value={form.meta_title} onChange={set('meta_title')} />
            </div>
            <div className="field">
              <label htmlFor="md">Page description</label>
              <input id="md" className="input" maxLength={500} value={form.meta_description} onChange={set('meta_description')} />
            </div>
          </div>
        </details>
        {!disabled && (
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

function VariantRow({ v, manage, onSaved }: { v: Variant; manage: boolean; onSaved: (p: ProductDetail) => void }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    sku: v.sku, price: v.price, compare_at_price: v.compare_at_price ?? '', cost_price: v.cost_price ?? '',
    weight_grams: v.weight_grams ? String(v.weight_grams) : '', low_stock_threshold: String(v.low_stock_threshold), is_active: v.is_active,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await api<{ data: ProductDetail }>(`/variants/${v.id}`, {
        method: 'PUT',
        body: {
          sku: form.sku,
          price: form.price,
          compare_at_price: form.compare_at_price || null,
          cost_price: form.cost_price || null,
          weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
          low_stock_threshold: Number(form.low_stock_threshold),
          is_active: form.is_active,
        },
      });
      setEdit(false);
      onSaved(r.data);
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(Object.keys(fe).length ? fe : { sku: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!edit) {
    return (
      <tr>
        <td><strong>{v.label || 'Default'}</strong>{v.is_default && <span className="muted"> (default)</span>}</td>
        <td className="num muted">{v.sku}</td>
        <td className="num">{taka(v.price)}{v.compare_at_price && <><br /><s className="muted">{taka(v.compare_at_price)}</s></>}</td>
        <td className="num">{v.cost_price ? taka(v.cost_price) : <span className="muted">Not set</span>}</td>
        <td className="num" style={{ fontWeight: 700, color: v.available <= 0 ? 'var(--danger)' : undefined }}>{v.available}<span className="muted" style={{ fontWeight: 400 }}> / {v.quantity}</span></td>
        <td>{v.is_active ? <span className="badge badge-active">On sale</span> : <span className="badge badge-archived">Hidden</span>}</td>
        <td>{manage && <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>Edit<span className="sr-only"> {v.label || v.sku}</span></button>}</td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong>{v.label || 'Default'}</strong>
          <div className="form-grid">
            <div className="field"><label htmlFor={`sku-${v.id}`}>SKU</label><input id={`sku-${v.id}`} className="input" value={form.sku} onChange={set('sku')} /><FieldError message={errors.sku} /></div>
            <div className="field"><label htmlFor={`pr-${v.id}`}>Selling price (Tk)</label><input id={`pr-${v.id}`} className="input" inputMode="decimal" value={form.price} onChange={set('price')} /><FieldError message={errors.price} /></div>
            <div className="field"><label htmlFor={`cp-${v.id}`}>Regular price (optional)</label><input id={`cp-${v.id}`} className="input" inputMode="decimal" value={form.compare_at_price} onChange={set('compare_at_price')} /><FieldError message={errors.compare_at_price} /></div>
            <div className="field"><label htmlFor={`co-${v.id}`}>Cost price (private)</label><input id={`co-${v.id}`} className="input" inputMode="decimal" value={form.cost_price} onChange={set('cost_price')} /><FieldError message={errors.cost_price} /></div>
            <div className="field"><label htmlFor={`wg-${v.id}`}>Weight (grams)</label><input id={`wg-${v.id}`} className="input" inputMode="numeric" value={form.weight_grams} onChange={set('weight_grams')} /><FieldError message={errors.weight_grams} /></div>
            <div className="field"><label htmlFor={`lt-${v.id}`}>Low stock alert at</label><input id={`lt-${v.id}`} className="input" inputMode="numeric" value={form.low_stock_threshold} onChange={set('low_stock_threshold')} /><FieldError message={errors.low_stock_threshold} /></div>
          </div>
          <label className="switch"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> On sale</label>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Price changes apply to new orders only. Stock is changed on the Inventory page, so every change is recorded.</p>
          <div className="actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save variant'}</button>
            <button type="button" className="btn btn-sm" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function VariantsSection({ product, meta, manage, onChange }: { product: ProductDetail; meta: Meta; manage: boolean; onChange: (p: ProductDetail, msg: string) => void }) {
  const [adding, setAdding] = useState(false);
  const base = product.variants[0];
  const [form, setForm] = useState({ size_value_id: '', color_value_id: '', sku: '', price: base?.price ?? '', initial_stock: '0', cost_price: base?.cost_price ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    try {
      const r = await api<{ data: ProductDetail }>(`/products/${product.id}/variants`, {
        method: 'POST',
        body: {
          size_value_id: form.size_value_id ? Number(form.size_value_id) : null,
          color_value_id: form.color_value_id ? Number(form.color_value_id) : null,
          sku: form.sku || null,
          price: form.price,
          cost_price: form.cost_price || null,
          initial_stock: Number(form.initial_stock || 0),
        },
      });
      setAdding(false);
      setForm({ ...form, size_value_id: '', color_value_id: '', sku: '', initial_stock: '0' });
      onChange(r.data, 'Variant added.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage((err as Error).message);
    }
  };

  return (
    <section className="card" aria-labelledby="variants-title">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <h2 id="variants-title" style={{ margin: 0 }}>Sizes, colors and prices</h2>
        <span className="actions">
          <Link className="btn btn-sm" to={`/inventory?q=${encodeURIComponent(product.name)}`}>Change stock</Link>
          {manage && !adding && <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>+ Add variant</button>}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Variant</th><th>SKU</th><th>Price</th><th>Cost</th><th>Available / on hand</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {product.variants.map((v) => <VariantRow key={v.id} v={v} manage={manage} onSaved={(p) => onChange(p, 'Variant saved.')} />)}
          </tbody>
        </table>
      </div>
      {adding && (
        <form onSubmit={add} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Add variant">
          {message && <div className="alert" role="alert">{message}</div>}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="nv-size">Size</label>
              <select id="nv-size" className="input" value={form.size_value_id} onChange={set('size_value_id')}>
                <option value="">No size</option>
                {meta.sizes.map((s) => <option key={s.id} value={s.id}>{s.value}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nv-color">Color</label>
              <select id="nv-color" className="input" value={form.color_value_id} onChange={set('color_value_id')}>
                <option value="">No color</option>
                {meta.colors.map((c) => <option key={c.id} value={c.id}>{c.value}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="nv-price">Selling price (Tk)</label><input id="nv-price" className="input" inputMode="decimal" value={form.price} onChange={set('price')} /><FieldError message={errors.price} /></div>
            <div className="field"><label htmlFor="nv-cost">Cost price (private)</label><input id="nv-cost" className="input" inputMode="decimal" value={form.cost_price} onChange={set('cost_price')} /><FieldError message={errors.cost_price} /></div>
            <div className="field"><label htmlFor="nv-sku">SKU (optional)</label><input id="nv-sku" className="input" value={form.sku} onChange={set('sku')} placeholder="Created automatically" /><FieldError message={errors.sku} /></div>
            <div className="field"><label htmlFor="nv-stock">Opening stock</label><input id="nv-stock" className="input" inputMode="numeric" value={form.initial_stock} onChange={set('initial_stock')} /><FieldError message={errors.initial_stock} /></div>
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary btn-sm">Add variant</button>
            <button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
