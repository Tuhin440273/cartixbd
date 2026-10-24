import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, dhakaDateTime, STATUS_LABEL, taka } from '../api';
import type { OrderDetail as Detail, VendorOrderStatus } from '../api';
import { useAuth } from '../auth';
import { Skeleton, StatusBadge } from '../components/Layout';

export function OrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [order, setOrder] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    api<{ data: Detail }>(`/orders/${id}`).then((r) => setOrder(r.data)).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const run = async (label: string, path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await api<{ data: Detail }>(path, { method: 'POST', body });
      setOrder(r.data);
      setDone(label);
      setNote('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!order) return error ? <div className="alert" role="alert">{error}</div> : <div className="card"><Skeleton rows={8} /></div>;

  const manage = can('orders.manage');
  const hasPending = order.vendor_orders.some((v) => v.status === 'pending');
  const cancellable = order.vendor_orders.some((v) => v.allowed_next.some((n) => n.value === 'cancelled'));

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/orders" className="muted">← All orders</Link>
          <h1 className="num">{order.order_number}</h1>
          <span className="muted">{dhakaDateTime(order.created_at)} · {order.payment_method_label}</span>
        </div>
        <StatusBadge status={order.status} label={order.status_label} />
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {done && <div className="notice" role="status">{done}</div>}

      {manage && (hasPending || cancellable) && (
        <section className="card" aria-labelledby="act-title">
          <h2 id="act-title">Next step</h2>
          {hasPending && (
            <p style={{ marginTop: 0 }}>
              Call the customer on <a href={`tel:${order.customer_phone}`} className="num" style={{ fontWeight: 700 }}>{order.customer_phone}</a> to confirm the order.
              If they do not confirm, cancel it so the reserved stock goes back on sale.
            </p>
          )}
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="note">Note {cancellable && <span className="muted">(a reason is required to cancel)</span>}</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer did not answer" maxLength={500} />
          </div>
          <div className="actions">
            {hasPending && (
              <button className="btn btn-primary" type="button" disabled={busy}
                onClick={() => void run('Order confirmed', `/orders/${order.id}/confirm`, { note: note || undefined })}>
                Confirmed by phone
              </button>
            )}
            {cancellable && (
              <button className="btn btn-danger" type="button" disabled={busy || note.trim() === ''}
                onClick={() => void run('Order cancelled', `/orders/${order.id}/cancel`, { note })}>
                Cancel order
              </button>
            )}
          </div>
        </section>
      )}

      <div className="detail-grid">
        <section className="card" aria-labelledby="cust-title">
          <h2 id="cust-title">Customer</h2>
          <dl className="kv">
            <dt>Name</dt><dd>{order.customer_name}</dd>
            <dt>Phone</dt><dd className="num">{order.customer_phone}</dd>
            {order.customer_email && (<><dt>Email</dt><dd>{order.customer_email}</dd></>)}
            {order.coupon_code && (<><dt>Coupon</dt><dd>{order.coupon_code}</dd></>)}
            {order.customer_note && (<><dt>Customer note</dt><dd>{order.customer_note}</dd></>)}
          </dl>
        </section>
        <section className="card" aria-labelledby="ship-title">
          <h2 id="ship-title">Delivery address</h2>
          <dl className="kv">
            <dt>Recipient</dt><dd>{order.ship.recipient_name}</dd>
            <dt>Phone</dt><dd className="num">{order.ship.phone}</dd>
            <dt>Address</dt>
            <dd>{order.ship.address_line}{order.ship.upazila ? `, ${order.ship.upazila}` : ''}, {order.ship.district}, {order.ship.division}{order.ship.postcode ? ` ${order.ship.postcode}` : ''}</dd>
          </dl>
        </section>
      </div>

      {order.vendor_orders.map((vo) => (
        <section className="card" key={vo.id} aria-labelledby={`vo-${vo.id}`}>
          <div className="page-head" style={{ marginBottom: 10 }}>
            <div>
              <h2 id={`vo-${vo.id}`} style={{ margin: 0 }} className="num">{vo.sub_number}</h2>
              <span className="muted">{vo.vendor}</span>
            </div>
            <StatusBadge status={vo.status} label={vo.status_label} />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Qty</th><th>Discount</th><th>Total</th></tr></thead>
              <tbody>
                {vo.items.map((it) => (
                  <tr key={it.id}>
                    <td><strong>{it.product_name}</strong>{it.variant_label && <><br /><span className="muted">{it.variant_label}</span></>}</td>
                    <td className="num muted">{it.sku}</td>
                    <td className="num">{taka(it.unit_price)}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{Number(it.discount_amount) > 0 ? `−${taka(it.discount_amount)}` : '—'}</td>
                    <td className="num"><strong>{taka(it.line_total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {manage && vo.allowed_next.filter((n) => n.value !== 'cancelled' && n.value !== 'confirmed').length > 0 && (
            <div className="actions" style={{ marginTop: 12 }}>
              <span className="muted">Change status:</span>
              {vo.allowed_next.filter((n) => n.value !== 'cancelled' && n.value !== 'confirmed').map((n) => (
                <button key={n.value} type="button" className="btn btn-sm" disabled={busy}
                  onClick={() => void run(`${vo.sub_number}: ${n.label}`, `/vendor-orders/${vo.id}/status`, { status: n.value as VendorOrderStatus, note: note || undefined })}>
                  {n.label}
                </button>
              ))}
            </div>
          )}
        </section>
      ))}

      <div className="detail-grid">
        <section className="card" aria-labelledby="hist-title">
          <h2 id="hist-title">History</h2>
          <ol className="timeline">
            {order.history.map((h, i) => (
              <li key={i}>
                <span className="muted num">{dhakaDateTime(h.at)}</span>
                <span>
                  <strong>{STATUS_LABEL[h.to] ?? h.to}</strong>{h.from ? <span className="muted"> (from {STATUS_LABEL[h.from] ?? h.from})</span> : null}
                  {h.sub_order ? <span className="muted"> · vendor order</span> : null}
                  {h.by ? <span className="muted"> · {h.by}</span> : null}
                  {h.note ? <><br />{h.note}</> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="card" aria-labelledby="tot-title">
          <h2 id="tot-title">Totals</h2>
          <div className="totals num">
            <span>Items</span><span>{taka(order.totals.subtotal)}</span>
            {Number(order.totals.discount_total) > 0 && (<><span>Discount</span><span>−{taka(order.totals.discount_total)}</span></>)}
            <span>Delivery</span><span>{taka(order.totals.shipping_total)}</span>
            {Number(order.totals.shipping_discount) > 0 && (<><span>Delivery discount</span><span>−{taka(order.totals.shipping_discount)}</span></>)}
            <span className="grand">Total</span><span className="grand">{taka(order.totals.grand_total)}</span>
          </div>
        </section>
      </div>
    </>
  );
}
