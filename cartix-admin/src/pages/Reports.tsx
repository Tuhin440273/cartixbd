import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, taka } from '../api';
import type { SalesReport } from '../api';
import { Skeleton } from '../components/Layout';

const dhakaToday = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 6 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);

const PRESETS: { label: string; from: () => string }[] = [
  { label: 'Today', from: () => dhakaToday() },
  { label: 'Last 7 days', from: () => daysAgo(6) },
  { label: 'Last 30 days', from: () => daysAgo(29) },
  { label: 'Last 90 days', from: () => daysAgo(89) },
];

export function Reports() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(dhakaToday());
  const [range, setRange] = useState({ from: daysAgo(29), to: dhakaToday() });
  const [data, setData] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<SalesReport>('/reports/sales', { query: range }).then(setData).catch((e: Error) => setError(e.message));
  }, [range]);
  useEffect(load, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setRange({ from, to });
  };

  const s = data?.summary;
  const maxSales = Math.max(1, ...(data?.daily.map((d) => Number(d.gross_sales)) ?? [1]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports &amp; Analytics</h1>
          <span className="muted">Sales and profit by the date orders were placed (Dhaka time).</span>
        </div>
      </div>

      <form className="filters" onSubmit={submit} aria-label="Report period">
        <div className="field"><label htmlFor="r-from">From</label><input id="r-from" className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label htmlFor="r-to">To</label><input id="r-to" className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit">Show</button>
        <div className="chips" role="group" aria-label="Quick periods">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="chip" aria-pressed={range.from === p.from() && range.to === dhakaToday()}
              onClick={() => { const f = p.from(); setFrom(f); setTo(dhakaToday()); setRange({ from: f, to: dhakaToday() }); }}>{p.label}</button>
          ))}
        </div>
      </form>

      {error && <div className="alert" role="alert">{error}</div>}
      {!data || !s ? <div className="card"><Skeleton rows={6} /></div> : (
        <>
          <section className="grid-kpi" aria-label="Summary">
            <div className="card kpi"><span className="label">Gross sales</span><span className="value num">{taka(s.gross_sales)}</span><span className="note">{s.orders - s.cancelled_orders} orders, delivery included, cancelled excluded</span></div>
            <div className="card kpi"><span className="label">Product sales</span><span className="value num">{taka(s.product_sales)}</span><span className="note">{s.units_sold} units after discounts, returns excluded</span></div>
            <div className="card kpi"><span className="label">Cost of goods</span><span className="value num">{taka(s.cost_of_goods)}</span><span className="note">From the cost price saved on each order</span></div>
            <div className="card kpi"><span className="label">Gross profit</span><span className="value num">{taka(s.gross_profit)}</span><span className="note">Of which delivered: {taka(s.delivered_profit)}</span></div>
          </section>

          {s.items_without_cost > 0 && (
            <div className="alert" role="status">
              {s.items_without_cost} sold item(s) worth {taka(s.sales_without_cost)} have no cost price, so they are left out of the profit figures.
              Add cost prices to the product variants to include future sales.
            </div>
          )}

          <section className="card" aria-labelledby="extra-title">
            <h2 id="extra-title">Other figures</h2>
            <dl className="kv">
              <dt>Orders placed</dt><dd className="num">{s.orders}</dd>
              <dt>Cancelled orders</dt><dd className="num">{s.cancelled_orders}</dd>
              <dt>Discounts given</dt><dd className="num">{taka(s.discounts)}</dd>
              <dt>Delivery charges collected</dt><dd className="num">{taka(s.delivery_charges)} <span className="muted" style={{ fontWeight: 400 }}>(paid on to the courier, not profit)</span></dd>
            </dl>
          </section>

          <div className="row">
            <section className="card grow-2" aria-labelledby="daily-title">
              <h2 id="daily-title">Day by day</h2>
              {data.daily.length <= 92 && (
                <div className="mini-bars" role="img" aria-label="Gross sales per day">
                  {data.daily.map((d) => <span key={d.date} title={`${d.date}: ${taka(d.gross_sales)}`} style={{ height: `${(Number(d.gross_sales) / maxSales) * 100}%` }} />)}
                </div>
              )}
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto', marginTop: 12 }}>
                <table>
                  <thead><tr><th>Date</th><th>Orders</th><th>Gross sales</th><th>Gross profit</th></tr></thead>
                  <tbody>
                    {[...data.daily].reverse().map((d) => (
                      <tr key={d.date}><td className="num">{d.date}</td><td className="num">{d.orders}</td><td className="num">{taka(d.gross_sales)}</td><td className="num">{taka(d.gross_profit)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card grow-1" aria-labelledby="top-title">
              <h2 id="top-title">Best sellers</h2>
              {data.top_products.length === 0 ? <p className="muted">No sales in this period.</p> : (
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.top_products.map((p) => (
                    <li key={p.product_id}>
                      <Link to={`/products/${p.product_id}`}>{p.name}</Link>
                      <br /><span className="muted num" style={{ fontSize: 13 }}>{p.units} sold · {taka(p.sales)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
