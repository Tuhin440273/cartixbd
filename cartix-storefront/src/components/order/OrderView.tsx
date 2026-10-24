import type { Order } from '@/lib/types';
import { formatDate, formatPrice } from '@/lib/format';
import { SmartImage } from '@/components/ui/SmartImage';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  confirmed: 'bg-primary-soft text-primary',
  packed: 'bg-primary-soft text-primary',
  processing: 'bg-primary-soft text-primary',
  shipped: 'bg-primary-soft text-primary',
  delivered: 'bg-success-soft text-success',
  completed: 'bg-success-soft text-success',
  cancelled: 'bg-danger-soft text-danger',
  returned: 'bg-danger-soft text-danger',
};

export function StatusBadge({ code, label }: { code: string; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[code] ?? 'bg-page text-muted'}`}>{label}</span>;
}

/** Order details as returned by the API. The lookup view arrives already masked by the server. */
export function OrderView({ order }: { order: Order }) {
  const a = order.shipping_address;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section aria-labelledby="order-items" className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="order-items" className="text-lg font-semibold">Items</h2>
            <StatusBadge code={order.status.code} label={order.status.label} />
          </div>
          <ul className="divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-page">
                  {i.image && <SmartImage src={i.image} alt="" fill sizes="64px" className="object-contain p-1" />}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{i.product_name}</p>
                  {i.variant_label && <p className="text-muted">{i.variant_label}</p>}
                  <p className="text-muted">{i.quantity} x {formatPrice(i.unit_price)}</p>
                </div>
                <p className="text-sm font-semibold">{formatPrice(i.line_total)}</p>
              </li>
            ))}
          </ul>
        </section>

        {order.shipments.length > 0 && (
          <section aria-labelledby="order-shipments" className="card p-5">
            <h2 id="order-shipments" className="mb-3 text-lg font-semibold">Shipments</h2>
            <ul className="space-y-3 text-sm">
              {order.shipments.map((s) => (
                <li key={s.number} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.number}</span>
                  <StatusBadge code={s.status.code} label={s.status.label} />
                  {s.tracking.map((t) => (
                    <span key={t.tracking_code} className="w-full text-muted">
                      {t.courier}: {t.tracking_code}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <section aria-labelledby="order-summary" className="card space-y-2 p-5 text-sm">
          <h2 id="order-summary" className="mb-2 text-lg font-semibold">Summary</h2>
          <div className="flex justify-between"><span className="text-muted">Order date</span><span>{formatDate(order.placed_at)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Payment</span><span>{order.payment.method_label}</span></div>
          <div className="flex justify-between"><span className="text-muted">Payment status</span><span>{order.payment.status_label}</span></div>
          <div className="flex justify-between border-t border-line pt-2"><span className="text-muted">Subtotal</span><span>{formatPrice(order.totals.subtotal)}</span></div>
          {Number(order.totals.discount) > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>- {formatPrice(order.totals.discount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted">Delivery</span><span>{formatPrice(order.totals.shipping)}</span></div>
          {Number(order.totals.shipping_discount) > 0 && <div className="flex justify-between text-success"><span>Delivery discount</span><span>- {formatPrice(order.totals.shipping_discount)}</span></div>}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total</span><span>{formatPrice(order.totals.total)}</span></div>
        </section>
        <section aria-labelledby="order-address" className="card p-5 text-sm">
          <h2 id="order-address" className="mb-2 text-lg font-semibold">Delivery</h2>
          <p>{a.recipient_name}</p>
          {a.phone && <p className="text-muted">{a.phone}</p>}
          {a.address_line && <p className="text-muted">{a.address_line}</p>}
          <p className="text-muted">{[a.area, a.district, a.division].filter(Boolean).join(', ')}{a.postcode ? ` ${a.postcode}` : ''}</p>
          {order.note && <p className="mt-2 text-muted">Note: {order.note}</p>}
        </section>
      </aside>
    </div>
  );
}
