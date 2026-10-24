import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { API_URL } from '@/lib/api';
import { orderCookieName } from '@/lib/backend';
import type { Order } from '@/lib/types';
import { OrderView } from '@/components/order/OrderView';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckIcon } from '@/components/ui/icons';

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ placed?: string }> };

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };

async function loadOrder(number: string): Promise<Order | null> {
  if (!/^[A-Za-z0-9-]{1,30}$/.test(number)) return null;
  const token = (await cookies()).get(orderCookieName(number))?.value;
  if (!token) return null;
  const res = await fetch(`${API_URL}/orders/${encodeURIComponent(number)}`, {
    headers: { Accept: 'application/json', 'X-Order-Token': token },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { data: Order }).data;
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { number } = await params;
  const { placed } = await searchParams;
  const order = await loadOrder(number);

  if (!order) {
    return (
      <div className="container-page py-10">
        <EmptyState
          level={1}
          title="We could not show this order here"
          text="Order details open only on the device that placed the order. You can still check its status with your order number and mobile number."
          action={{ href: '/track-order', label: 'Track your order' }}
        />
      </div>
    );
  }

  return (
    <div className="container-page space-y-6 py-6">
      {placed === '1' ? (
        <div className="card flex flex-col items-center gap-2 p-6 text-center sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success"><CheckIcon className="h-7 w-7" /></span>
          <h1 className="text-2xl font-bold tracking-tight">Thank you, your order has been placed</h1>
          <p className="text-muted">
            Order number <strong className="text-ink">{order.order_number}</strong>. We will call {order.customer.phone} to confirm it.
          </p>
          <p className="text-sm text-subtle">Keep your order number to track your order later.</p>
        </div>
      ) : (
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Order {order.order_number}</h1>
      )}
      <OrderView order={order} />
      <div className="flex flex-wrap gap-3">
        <Link href="/products" className="btn-primary">Continue shopping</Link>
        <Link href="/track-order" className="btn-outline">Track an order</Link>
      </div>
    </div>
  );
}
