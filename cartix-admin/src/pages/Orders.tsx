import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, dhakaDateTime, taka } from '../api';
import type { OrderSummary, Paged } from '../api';
import { Skeleton, StatusBadge } from '../components/Layout';

const TABS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

type OrdersResponse = Paged<OrderSummary> & { status_counts: Record<string, number> };

export function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setData(null);
    api<OrdersResponse>('/orders', { query: { status, q, page } })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [status, q, page]);

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: search.trim() });
  };

  const total = data ? Object.values(data.status_counts).reduce((a, b) => a + Number(b), 0) : 0;

  return (
    <>
      <div className="page-head">
        <h1>Orders</h1>
        <form onSubmit={submit} className="actions" role="search">
          <label htmlFor="order-search" className="sr-only">Search orders</label>
          <input id="order-search" className="input" style={{ width: 260 }} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, phone or name" />
          <button className="btn" type="submit">Search</button>
        </form>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        {TABS.map((t) => {
          const count = t.value === '' ? total : Number(data?.status_counts[t.value] ?? 0);
          return (
            <button key={t.value} type="button" className="chip" aria-pressed={status === t.value} onClick={() => update({ status: t.value })}>
              {t.label} {data && <span className="num">({count})</span>}
            </button>
          );
        })}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <section className="card">
        {!data ? (
          <Skeleton rows={8} />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Phone</th><th>District</th><th>Payment</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.data.map((o) => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.order_number}</Link><br /><span className="muted" style={{ fontSize: 13 }}>{dhakaDateTime(o.created_at)}</span></td>
                      <td>{o.customer_name}</td>
                      <td className="num">{o.customer_phone}</td>
                      <td>{o.district}</td>
                      <td>{o.payment_method_label}</td>
                      <td className="num">{taka(o.grand_total)}</td>
                      <td><StatusBadge status={o.status} label={o.status_label} /></td>
                    </tr>
                  ))}
                  {data.data.length === 0 && (
                    <tr><td colSpan={7} className="muted">No orders match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.meta.last_page > 1 && (
              <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-sm" type="button" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
                <span className="muted num">{page} / {data.meta.last_page}</span>
                <button className="btn btn-sm" type="button" disabled={page >= data.meta.last_page} onClick={() => update({ page: String(page + 1) })}>Next</button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
