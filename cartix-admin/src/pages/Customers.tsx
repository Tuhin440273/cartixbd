import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, dhakaDateTime, taka } from '../api';
import type { CustomerDetail as Detail, CustomerRow, Paged } from '../api';
import { Skeleton, StatusBadge } from '../components/Layout';
import { Pager } from '../components/ui';
import { dhakaDate } from '../components/hooks';

export function Customers() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'recent';
  const page = Number(params.get('page') ?? '1');
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Paged<CustomerRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Paged<CustomerRow>>('/customers', { query: { q, sort, page } }).then(setData).catch((e: Error) => setError(e.message));
  }, [q, sort, page]);
  useEffect(load, [load]);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <span className="muted">Customers are grouped by mobile number, from their orders.</span>
        </div>
      </div>
      <div className="filters">
        <form className="actions" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); update({ q: search.trim() }); }}>
          <label htmlFor="csearch" className="sr-only">Search customers</label>
          <input id="csearch" className="input" style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone" />
          <button className="btn" type="submit">Search</button>
        </form>
        <label htmlFor="csort" className="sr-only">Sort</label>
        <select id="csort" className="input" value={sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="recent">Most recent order</option>
          <option value="orders">Most orders</option>
          <option value="spent">Highest spending</option>
        </select>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <section className="card">
        {!data ? <Skeleton rows={8} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Phone</th><th>District</th><th>Orders</th><th>Spent</th><th>Last order</th></tr></thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.phone}>
                    <td><Link to={`/customers/${c.phone}`}>{c.name ?? 'Unknown'}</Link></td>
                    <td className="num">{c.phone}</td>
                    <td>{c.district}</td>
                    <td className="num">{c.orders_count}{c.cancelled_count > 0 && <span className="muted"> ({c.cancelled_count} cancelled)</span>}</td>
                    <td className="num">{taka(c.total_spent)}</td>
                    <td className="num">{dhakaDate(c.last_order_at)}</td>
                  </tr>
                ))}
                {data.data.length === 0 && <tr><td colSpan={6} className="muted">No customers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.meta.current_page} last={data.meta.last_page} onPage={(n) => update({ page: String(n) })} />}
      </section>
    </>
  );
}

export function CustomerDetail() {
  const { phone } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: Detail }>(`/customers/${encodeURIComponent(phone ?? '')}`).then((r) => setData(r.data)).catch((e: Error) => setError(e.message));
  }, [phone]);

  if (!data) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={6} /></div>;
  const a = data.last_address;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/customers" className="muted">← Customers</Link>
          <h1>{data.name}</h1>
        </div>
        <a className="btn" href={`tel:${data.phone}`}>Call {data.phone}</a>
      </div>
      <section className="grid-kpi" aria-label="Customer figures">
        <div className="card kpi"><span className="label">Orders</span><span className="value num">{data.orders_count}</span><span className="note">{data.cancelled_count} cancelled</span></div>
        <div className="card kpi"><span className="label">Total spent</span><span className="value num">{taka(data.total_spent)}</span><span className="note">Cancelled orders excluded</span></div>
      </section>
      <section className="card" aria-labelledby="addr-title">
        <h2 id="addr-title">Last delivery address</h2>
        <dl className="kv">
          <dt>Recipient</dt><dd>{a.recipient_name} ({a.phone})</dd>
          <dt>Address</dt><dd>{a.address_line}</dd>
          <dt>Area</dt><dd>{[a.area, a.district, a.division].filter(Boolean).join(', ')}</dd>
          {data.email && <><dt>Email</dt><dd>{data.email}</dd></>}
        </dl>
      </section>
      <section className="card" aria-labelledby="ord-title">
        <h2 id="ord-title">Orders</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/orders/${o.id}`}>{o.order_number}</Link></td>
                  <td className="num">{dhakaDateTime(o.created_at)}</td>
                  <td className="num">{taka(o.grand_total)}</td>
                  <td><StatusBadge status={o.status} label={o.status_label} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
