import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, taka } from '../api';
import type { Meta, Paged, ProductRow } from '../api';
import { Pager } from '../components/ui';
import { useAuth } from '../auth';
import { Skeleton, StatusBadge } from '../components/Layout';

export function Products() {
  const { can } = useAuth();
  const [data, setData] = useState<Paged<ProductRow> | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const category = params.get('category_id') ?? '';
  const stock = params.get('stock') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [q, setQ] = useState(query);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Paged<ProductRow>>('/products', { query: { q: query, status, category_id: category, stock, page } })
      .then(setData).catch((e: Error) => setError(e.message));
  }, [query, status, category, stock, page]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Meta>('/meta').then(setMeta).catch(() => undefined);
  }, []);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const setStatus = async (p: ProductRow, status: string) => {
    try {
      await api(`/products/${p.id}/status`, { method: 'PATCH', body: { status } });
      setToast(status === 'active' ? 'Product is now live.' : 'Product has been archived.');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Products</h1>
        {can('products.manage') && <Link className="btn btn-primary" to="/products/new">+ New product</Link>}
      </div>

      <div className="filters">
        <form className="actions" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <label htmlFor="psearch" className="sr-only">Search products</label>
          <input id="psearch" className="input" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or SKU" />
          <button className="btn" type="submit">Search</button>
        </form>
        <label className="sr-only" htmlFor="f-status">Status</label>
        <select id="f-status" className="input" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(meta?.product_statuses ?? {}).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-cat">Category</label>
        <select id="f-cat" className="input" value={category} onChange={(e) => update({ category_id: e.target.value })}>
          <option value="">All categories</option>
          {meta?.categories.filter((c) => c.parent_id === null).map((p) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id}>{p.name} (all)</option>
              {meta.categories.filter((c) => c.parent_id === p.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-stock">Stock</label>
        <select id="f-stock" className="input" value={stock} onChange={(e) => update({ stock: e.target.value })}>
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        {(query || status || category || stock) && <button className="btn btn-sm" type="button" onClick={() => { setQ(''); setParams(new URLSearchParams()); }}>Clear filters</button>}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <section className="card">
        {!data ? <Skeleton rows={8} /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Product</th><th>Category</th><th>Price</th><th>Available stock</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td>
                        <button type="button" className="btn btn-sm" aria-expanded={open === p.id} aria-controls={`v-${p.id}`}
                          onClick={() => setOpen(open === p.id ? null : p.id)} style={{ marginRight: 8 }}>
                          {open === p.id ? '−' : '+'}<span className="sr-only">Show variants</span>
                        </button>
                        <span className="cell-product" style={{ display: 'inline-flex' }}>
                          {p.image ? <img className="thumb" src={p.image} alt="" /> : <span className="thumb" aria-hidden="true" />}
                          <span>
                            <Link to={`/products/${p.id}`}>{p.name}</Link>
                            <br /><span className="muted" style={{ fontSize: 13 }}>{p.variants.length} {p.variants.length === 1 ? 'variant' : 'variants'} · {p.sold_count} sold</span>
                          </span>
                        </span>
                      </td>
                      <td>{p.category}</td>
                      <td className="num">{p.min_price === p.max_price ? taka(p.min_price) : `${taka(p.min_price)} – ${taka(p.max_price)}`}</td>
                      <td className="num" style={{ fontWeight: 700, color: p.stock === 0 ? 'var(--danger)' : undefined }}>{p.stock}</td>
                      <td><StatusBadge status={p.status} label={p.status_label} /></td>
                      <td>
                        <span className="actions">
                          {can('products.manage') && <Link className="btn btn-sm" to={`/products/${p.id}`}>Edit</Link>}
                          {can('products.manage') && (p.status === 'active'
                            ? <button className="btn btn-sm" type="button" onClick={() => void setStatus(p, 'archived')}>Archive</button>
                            : <button className="btn btn-sm" type="button" onClick={() => void setStatus(p, 'active')}>Publish</button>)}
                        </span>
                      </td>
                    </tr>
                    {open === p.id && (
                      <tr id={`v-${p.id}`}>
                        <td colSpan={6} style={{ background: 'var(--surface-2)' }}>
                          <VariantStock product={p} canAdjust={can('inventory.manage')} onSaved={(msg) => { setToast(msg); load(); }} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {data.data.length === 0 && <tr><td colSpan={6} className="muted">No products found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.meta.current_page} last={data.meta.last_page} onPage={(n) => update({ page: String(n) })} />}
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function VariantStock({ product, canAdjust, onSaved }: { product: ProductRow; canAdjust: boolean; onSaved: (msg: string) => void }) {
  const [change, setChange] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = async (variantId: number) => {
    const n = Number(change[variantId]);
    if (!Number.isInteger(n) || n === 0) {
      setError('Enter a whole number for the stock change, for example 10 or -2.');
      return;
    }
    setError(null);
    try {
      await api(`/variants/${variantId}/stock`, { method: 'POST', body: { change: n, reason: n > 0 ? 'purchase' : 'adjustment' } });
      setChange((c) => ({ ...c, [variantId]: '' }));
      onSaved(n > 0 ? `Added ${n} to stock.` : `Removed ${Math.abs(n)} from stock.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div className="error-text" role="alert">{error}</div>}
      <table>
        <thead>
          <tr><th>Variant</th><th>SKU</th><th>Price</th><th>On hand</th><th>Reserved</th><th>Available</th>{canAdjust && <th>Adjust stock</th>}</tr>
        </thead>
        <tbody>
          {product.variants.map((v) => (
            <tr key={v.id}>
              <td>{v.label || 'Default'}</td>
              <td className="num muted">{v.sku}</td>
              <td className="num">{taka(v.price)}</td>
              <td className="num">{v.quantity}</td>
              <td className="num">{v.reserved}</td>
              <td className="num" style={{ fontWeight: 700, color: v.low ? 'var(--danger)' : undefined }}>{v.available}</td>
              {canAdjust && (
                <td>
                  <div className="actions">
                    <label htmlFor={`chg-${v.id}`} className="sr-only">Stock change for {v.label || v.sku}</label>
                    <input id={`chg-${v.id}`} className="input" style={{ width: 90, minHeight: 36 }} inputMode="numeric" placeholder="+10"
                      value={change[v.id] ?? ''} onChange={(e) => setChange((c) => ({ ...c, [v.id]: e.target.value }))} />
                    <button className="btn btn-sm" type="button" onClick={() => void save(v.id)}>Save</button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
