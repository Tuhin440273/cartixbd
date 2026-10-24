import type { Metadata } from 'next';
import { getCheckoutOptions, getDivisions } from '@/lib/api';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const [divisions, options] = await Promise.all([getDivisions(), getCheckoutOptions()]);
  return (
    <div className="container-page py-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>
      <CheckoutForm divisions={divisions} paymentMethods={options.payment_methods} />
    </div>
  );
}
