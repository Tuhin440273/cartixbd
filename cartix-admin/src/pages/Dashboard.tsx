import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, dhakaDateTime, taka } from '../api';
import type { DashboardData } from '../api';
import { Skeleton, StatusBadge } from '../components/Layout';
import { useAuth } from '../auth';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Asia/Dhaka' });

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { can } = useAuth();

  useEffect(() => {
    api<DashboardData>('/dashboard').then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="alert" role="alert">{error}</div>;

  const max = Math.max(1, ...(data?.orders_per_day.map((d) => d.orders) ?? [1]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <span className="muted">Today's business at a glance</span>
        </div>
      </div>

      <nav className="quick" aria-label="Quick actions">
        {can('orders.view') && <Link className="btn btn-primary" to="/orders?status=pending">Orders to confirm</Link>}
        {can('products.manage') && <Link className="btn" to="/products/new">+ New product</Link>}
        {can('products.view') && <Link className="btn" to="/inventory?stock=low">Restock low items</Link>}
        {can('coupons.manage') && <Link className="btn" to="/coupons">Create a coupon</Link>}
        {can('reports.view') && <Link className="btn" to="/reports">Sales report</Link>}
      </nav>

      {!data ? (
        <div className="card"><Skeleton rows={6} /></div>
      ) : (
        <>
          <section className="grid-kpi" aria-label="Key figures">
            <div className="card kpi">
              <span className="label">Orders today</span>
              <span className="value num">{data.kpis.today_orders}</span>
              <span className="note">Yesterday: {data.kpis.yesterday_orders}</span>
            </div>
            <div className="card kpi">
              <span className="label">Sales today</span>
              <span className="value num">{taka(data.kpis.today_sales)}</span>
              <span className="note">Order totals with delivery, cancelled excluded</span>
            </div>
            <div className="card kpi">
              <span className="label">Gross profit today</span>
              <span className="value num">{taka(data.kpis.today_gross_profit)}</span>
              <span className="note">
                {data.kpis.today_items_without_cost > 0
                  ? `${data.kpis.today_items_without_cost} item(s) have no cost price and are not counted`
                  : 'Product sales minus cost price'}
              </span>
            </div>
            <Link className="card kpi" to="/orders?status=pending" style={{ textDecoration: 'none' }}>
              <span className="label">Pending orders</span>
              <span className="value num">{data.kpis.pending_orders}</span>
              <span className="note">New orders to confirm by phone</span>
            </Link>
            <Link className="card kpi" to="/inventory?stock=low" style={{ textDecoration: 'none' }}>
              <span className="label">Low stock items</span>
              <span className="value num" style={{ color: data.kpis.low_stock_count > 0 ? 'var(--danger)' : undefined }}>{data.kpis.low_stock_count}</span>
              <span className="note">At or below their alert level</span>
            </Link>
            <div className="card kpi">
              <span className="label">Return rate (30 days)</span>
              <span className="value num">{data.kpis.return_rate_30d}%</span>
              <span className="note">Of {data.kpis.shipped_30d} shipped orders</span>
            </div>
          </section>

          <div className="row">
            <section className="card grow-2" aria-labelledby="chart-title">
              <h2 id="chart-title">Orders in the last 7 days</h2>
              <div className="bars" role="img" aria-label={data.orders_per_day.map((d) => `${d.date}: ${d.orders}`).join(', ')}>
                {data.orders_per_day.map((d, i) => (
                  <div className="bar-col" key={d.date}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{d.orders}</span>
                    <div className={`bar${i === data.orders_per_day.length - 1 ? ' today' : ''}`} style={{ height: `${(d.orders / max) * 160}px` }} />
                  </div>
                ))}
              </div>
              <div className="bar-labels">
                {data.orders_per_day.map((d, i) => (
                  <span key={d.date}>{i === data.orders_per_day.length - 1 ? 'Today' : DAY.format(new Date(d.date + 'T12:00:00+06:00'))}</span>
                ))}
              </div>
            </section>

            <section className="card grow-1" aria-labelledby="pipe-title">
              <h2 id="pipe-title">Fulfillment pipeline</h2>
              <div className="pipe">
                {data.pipeline.map((p) => (
                  <div key={p.status} className={`pipe-row badge-${p.status}`}>
                    <span>{p.label}</span>
                    <span className="num">{p.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="row">
            <section className="card grow-2" aria-labelledby="recent-title">
              <div className="page-head" style={{ marginBottom: 8 }}>
                <h2 id="recent-title" style={{ margin: 0 }}>Recent orders</h2>
                <Link to="/orders">View all</Link>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Order</th><th>Customer</th><th>District</th><th>Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o) => (
                      <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                        <td><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.order_number}</Link><br /><span className="muted" style={{ fontSize: 13 }}>{dhakaDateTime(o.created_at)}</span></td>
                        <td>{o.customer_name}</td>
                        <td>{o.district}</td>
                        <td className="num">{taka(o.grand_total)}</td>
                        <td><StatusBadge status={o.status} label={o.status_label} /></td>
                      </tr>
                    ))}
                    {data.recent_orders.length === 0 && (
                      <tr><td colSpan={5} className="muted">No orders yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card grow-1" aria-labelledby="low-title">
              <h2 id="low-title">Low stock</h2>
              {data.low_stock.length === 0 ? (
                <p className="muted">All products have enough stock.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.low_stock.map((s) => (
                    <li key={s.variant_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                      <span>
                        <strong>{s.product}</strong><br />
                        <span className="muted" style={{ fontSize: 13 }}>{s.variant || s.sku}</span>
                      </span>
                      <span className="num" style={{ fontWeight: 700, color: s.available === 0 ? 'var(--danger)' : undefined }}>{s.available} left</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/inventory?stock=low" style={{ display: 'inline-block', marginTop: 10 }}>Open inventory</Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
