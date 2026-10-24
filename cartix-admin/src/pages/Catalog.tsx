import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fieldErrors } from '../api';
import type { Brand, Category } from '../api';
import { Skeleton } from '../components/Layout';
import { ConfirmButton, FieldError, Toast } from '../components/ui';
import { useToast } from '../components/hooks';

/** Categories (two levels) and brands. */
export function Catalog() {
  const [tab, setTab] = useState<'categories' | 'brands'>('categories');
  const [toast, showToast] = useToast();

  return (
    <>
      <div className="page-head"><h1>Categories &amp; Brands</h1></div>
      <div className="tabs" role="tablist" aria-label="Catalog sections">
        <button type="button" role="tab" id="tab-categories" aria-selected={tab === 'categories'} aria-controls="panel" onClick={() => setTab('categories')}>Categories</button>
        <button type="button" role="tab" id="tab-brands" aria-selected={tab === 'brands'} aria-controls="panel" onClick={() => setTab('brands')}>Brands</button>
      </div>
      <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'categories' ? <Categories notify={showToast} /> : <Brands notify={showToast} />}
      </div>
      <Toast message={toast} />
    </>
  );
}

function Categories({ notify }: { notify: (m: string) => void }) {
  const [tree, setTree] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const load = useCallback(() => {
    api<{ data: Category[] }>('/categories').then((r) => setTree(r.data)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async (c: Category) => {
    setError(null);
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      notify(`"${c.name}" deleted.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!tree) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={6} /></div>;

  const row = (c: Category, child: boolean) => (
    <tr key={c.id}>
      <td style={{ paddingLeft: child ? 34 : undefined }}>
        <span className="cell-product">
          {c.image ? <img className="thumb" src={c.image} alt="" /> : null}
          <strong>{c.name}</strong>
        </span>
      </td>
      <td className="num">{c.product_count}</td>
      <td>{c.is_active ? <span className="badge badge-active">Visible</span> : <span className="badge badge-archived">Hidden</span>}</td>
      <td className="num">{c.sort_order}</td>
      <td>
        <span className="actions">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(c)}>Edit<span className="sr-only"> {c.name}</span></button>
          <ConfirmButton label="Delete" confirmLabel="Delete" onConfirm={() => void remove(c)} />
        </span>
      </td>
    </tr>
  );

  return (
    <section className="card" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="page-head">
        <p className="muted" style={{ margin: 0 }}>Hidden categories disappear from the shop menu. A category with products cannot be deleted; hide it instead.</p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ New category</button>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          parents={tree.filter((c) => editing === 'new' || c.id !== editing.id)}
          canHaveParent={editing === 'new' || (editing.children ?? []).length === 0}
          onDone={(msg) => { setEditing(null); if (msg) { notify(msg); load(); } }}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Products</th><th>Shop menu</th><th>Order</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {tree.flatMap((p) => [row(p, false), ...(p.children ?? []).map((c) => row(c, true))])}
            {tree.length === 0 && <tr><td colSpan={5} className="muted">No categories yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryForm({ category, parents, canHaveParent, onDone }: {
  category: Category | null;
  parents: Category[];
  canHaveParent: boolean;
  onDone: (message: string | null) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category?.parent_id ? String(category.parent_id) : '');
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [active, setActive] = useState(category?.is_active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const body = new FormData();
    body.append('name', name);
    if (parentId) body.append('parent_id', parentId);
    body.append('sort_order', sortOrder || '0');
    body.append('is_active', active ? '1' : '0');
    if (file) body.append('image', file);
    if (removeImage) body.append('remove_image', '1');
    try {
      await api(category ? `/categories/${category.id}` : '/categories', { method: 'POST', body });
      onDone(category ? 'Category saved.' : 'Category created.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={category ? `Edit ${category.name}` : 'New category'}>
      <h2 style={{ margin: 0, fontSize: 17 }}>{category ? `Edit "${category.name}"` : 'New category'}</h2>
      {message && <div className="alert" role="alert">{message}</div>}
      <div className="form-grid">
        <div className="field"><label htmlFor="c-name">Name</label><input id="c-name" className="input" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /><FieldError message={errors.name} /></div>
        <div className="field">
          <label htmlFor="c-parent">Parent</label>
          <select id="c-parent" className="input" value={parentId} disabled={!canHaveParent} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None (top level)</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!canHaveParent && <span className="muted" style={{ fontSize: 13 }}>This category has subcategories, so it stays at the top level.</span>}
          <FieldError message={errors.parent_id} />
        </div>
        <div className="field"><label htmlFor="c-sort">Menu order</label><input id="c-sort" className="input" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /><FieldError message={errors.sort_order} /></div>
        <div className="field">
          <label htmlFor="c-img">Image (optional)</label>
          <input id="c-img" className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <FieldError message={errors.image} />
          {category?.image && <label className="switch"><input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} /> Remove current image</label>}
        </div>
      </div>
      <label className="switch"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show in the shop menu</label>
      <div className="actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save category'}</button>
        <button type="button" className="btn btn-sm" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}

function Brands({ notify }: { notify: (m: string) => void }) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Brand | 'new' | null>(null);

  const load = useCallback(() => {
    api<{ data: Brand[] }>('/brands').then((r) => setBrands(r.data)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async (b: Brand) => {
    setError(null);
    try {
      await api(`/brands/${b.id}`, { method: 'DELETE' });
      notify(`"${b.name}" deleted.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!brands) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={4} /></div>;

  return (
    <section className="card" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="page-head">
        <p className="muted" style={{ margin: 0 }}>Brands are optional. A brand with products cannot be deleted; hide it instead.</p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ New brand</button>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {editing && <BrandForm brand={editing === 'new' ? null : editing} onDone={(msg) => { setEditing(null); if (msg) { notify(msg); load(); } }} />}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Brand</th><th>Products</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id}>
                <td><span className="cell-product">{b.logo && <img className="thumb" style={{ height: 44, objectFit: 'contain' }} src={b.logo} alt="" />}<strong>{b.name}</strong></span></td>
                <td className="num">{b.product_count}</td>
                <td>{b.is_active ? <span className="badge badge-active">Active</span> : <span className="badge badge-archived">Hidden</span>}</td>
                <td>
                  <span className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(b)}>Edit<span className="sr-only"> {b.name}</span></button>
                    <ConfirmButton label="Delete" confirmLabel="Delete" onConfirm={() => void remove(b)} />
                  </span>
                </td>
              </tr>
            ))}
            {brands.length === 0 && <tr><td colSpan={4} className="muted">No brands yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BrandForm({ brand, onDone }: { brand: Brand | null; onDone: (message: string | null) => void }) {
  const [name, setName] = useState(brand?.name ?? '');
  const [active, setActive] = useState(brand?.is_active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = new FormData();
    body.append('name', name);
    body.append('is_active', active ? '1' : '0');
    if (file) body.append('logo', file);
    try {
      await api(brand ? `/brands/${brand.id}` : '/brands', { method: 'POST', body });
      onDone(brand ? 'Brand saved.' : 'Brand created.');
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { name: (err as Error).message });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={brand ? `Edit ${brand.name}` : 'New brand'}>
      <div className="form-grid">
        <div className="field"><label htmlFor="b-name">Brand name</label><input id="b-name" className="input" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /><FieldError message={errors.name} /></div>
        <div className="field"><label htmlFor="b-logo">Logo (optional)</label><input id="b-logo" className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><FieldError message={errors.logo} /></div>
      </div>
      <label className="switch"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <div className="actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save brand'}</button>
        <button type="button" className="btn btn-sm" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
