'use client';

import { useState } from 'react';
import type { Order } from '@/lib/types';
import { normalizeBdPhone } from '@/lib/format';
import { errorMessage } from '@/components/cart/CartProvider';
import { OrderView } from './OrderView';

export function TrackOrderForm() {
  const [number, setNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!number.trim() || !normalizeBdPhone(phone)) {
      setError('Please enter your order number and the mobile number used for the order.');
      return;
    }
    setBusy(true);
    setError(null);
    setOrder(null);
    try {
      const res = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ order_number: number.trim(), phone: phone.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) setOrder(body.data as Order);
      else setError(errorMessage(body, 'We could not find an order with these details.'));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6" aria-label="Find your order">
        <div>
          <label htmlFor="order_number" className="label">Order number</label>
          <input id="order_number" className="input uppercase" placeholder="CX-2026-000123" maxLength={30} value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="lookup_phone" className="label">Mobile number</label>
          <input id="lookup_phone" className="input" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
        <button type="submit" className="btn-primary h-[42px]" disabled={busy}>{busy ? 'Searching...' : 'Find order'}</button>
        {error && <p role="alert" className="text-sm font-medium text-danger sm:col-span-3">{error}</p>}
      </form>
      {order && (
        <section aria-label={`Order ${order.order_number}`} className="space-y-3">
          <h2 className="text-xl font-bold">Order {order.order_number}</h2>
          <p className="text-sm text-muted">For your privacy, contact details are partly hidden.</p>
          <OrderView order={order} />
        </section>
      )}
    </div>
  );
}
