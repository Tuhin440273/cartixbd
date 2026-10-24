'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from './CartProvider';
import { formatPrice } from '@/lib/format';
import { SmartImage } from '@/components/ui/SmartImage';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CartLine } from '@/lib/types';

function Line({ line }: { line: CartLine }) {
  const { updateItem, removeItem } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = line.product?.name ?? 'Unavailable item';

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.message ?? 'Could not update this item.');
  };

  const canChange = line.issue !== 'unavailable' && line.issue !== 'out_of_stock';
  const maxQty = Math.max(1, line.max_quantity);

  return (
    <li className="flex gap-4 py-4" aria-busy={busy}>
      <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-page">
        {line.image && <SmartImage src={line.image.url} alt={line.image.alt || name} fill sizes="96px" className="object-contain p-1" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {line.product ? (
              <Link href={`/product/${line.product.slug}`} className="font-semibold hover:text-primary">{name}</Link>
            ) : (
              <span className="font-semibold">{name}</span>
            )}
            {line.variant_label && <p className="text-sm text-muted">{line.variant_label}</p>}
          </div>
          <p className="shrink-0 text-right font-semibold">{line.line_total ? formatPrice(line.line_total) : ''}</p>
        </div>
        {line.unit_price && (
          <p className="text-sm text-muted">
            {formatPrice(line.unit_price)} each
            {line.previous_unit_price && <span className="ml-2 text-xs text-subtle line-through">{formatPrice(line.previous_unit_price)}</span>}
          </p>
        )}
        {line.issue_message && (
          <p className={`text-sm font-medium ${line.issue ? 'text-danger' : 'text-warning'}`} role={line.issue ? 'alert' : undefined}>
            {line.issue_message}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-3">
          {canChange && (
            <div className="flex items-center gap-2">
              <label htmlFor={`qty-${line.id}`} className="text-sm text-muted">Qty</label>
              <select
                id={`qty-${line.id}`}
                className="input w-20 py-1.5"
                value={Math.min(line.quantity, Math.max(maxQty, line.quantity))}
                disabled={busy}
                onChange={(e) => run(() => updateItem(line.id, Number(e.target.value)))}
              >
                {Array.from({ length: Math.max(maxQty, line.quantity) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} disabled={n > maxQty}>{n}</option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="text-sm font-medium text-danger hover:underline disabled:opacity-50" disabled={busy} onClick={() => run(() => removeItem(line.id))}>
            Remove<span className="sr-only"> {name}</span>
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </li>
  );
}

export function CartView() {
  const { cart, loading, refresh } = useCart();

  // Always show current prices and stock when the cart page opens.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !cart) {
    return <p className="card p-6 text-sm text-muted" role="status">Loading your cart...</p>;
  }
  if (!cart || cart.items.length === 0) {
    return <EmptyState title="Your cart is empty" text="Browse the shop and add something you like." action={{ href: '/products', label: 'Start shopping' }} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label="Items in your cart" className="card px-4 sm:px-6">
        <ul className="divide-y divide-line">
          {cart.items.map((l) => <Line key={l.id} line={l} />)}
        </ul>
      </section>
      <aside aria-label="Order summary" className="card h-fit space-y-4 p-5">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Items ({cart.item_count})</dt>
            <dd className="font-semibold">{formatPrice(cart.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="text-muted">Calculated at checkout</dd>
          </div>
        </dl>
        {cart.has_issues && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">Please fix the items marked above before checking out.</p>
        )}
        {cart.can_checkout ? (
          <Link href="/checkout" className="btn-primary w-full py-3">Proceed to checkout</Link>
        ) : (
          <button type="button" className="btn-primary w-full py-3" disabled>Proceed to checkout</button>
        )}
        <Link href="/products" className="block text-center text-sm font-medium text-primary hover:underline">Continue shopping</Link>
      </aside>
    </div>
  );
}
