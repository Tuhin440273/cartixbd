import type { Metadata } from 'next';
import { TrackOrderForm } from '@/components/order/TrackOrderForm';

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Check the status of your Cartix order with your order number and mobile number.',
  alternates: { canonical: '/track-order' },
};

export default function TrackOrderPage() {
  return (
    <div className="container-page py-6">
      <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">Track your order</h1>
      <p className="mb-6 text-muted">Enter the order number from your confirmation and the mobile number you used at checkout.</p>
      <TrackOrderForm />
    </div>
  );
}
