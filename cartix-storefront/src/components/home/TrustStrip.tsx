import type { HomeData } from '@/lib/types';
import { deliveryDays, formatPrice } from '@/lib/format';
import { CashIcon, ShieldIcon, TruckIcon } from '@/components/ui/icons';

/** Store facts taken from the backend settings (delivery zones, fees and payment methods). */
export function TrustStrip({ store }: { store: HomeData['store'] }) {
  const items: { icon: React.ReactNode; title: string; text: string }[] = [];
  const zones = store.delivery_zones;
  if (zones.length > 0) {
    const first = zones[0]!;
    items.push({
      icon: <TruckIcon className="h-6 w-6" />,
      title: `Delivery from ${formatPrice(store.delivery_from)}`,
      text: zones.map((z) => `${z.label}: ${formatPrice(z.fee)}${deliveryDays(z.min_days, z.max_days) ? `, ${deliveryDays(z.min_days, z.max_days)}` : ''}`).join(' · ') || first.label,
    });
  }
  if (store.payment_methods.length > 0) {
    items.push({
      icon: <CashIcon className="h-6 w-6" />,
      title: store.payment_methods.map((m) => m.label).join(', '),
      text: store.payment_methods.some((m) => m.code === 'cod') ? 'Pay when your parcel arrives.' : 'Secure payment at checkout.',
    });
  }
  items.push({
    icon: <ShieldIcon className="h-6 w-6" />,
    title: 'Track every order',
    text: 'Check your order status with your order number and phone.',
  });

  return (
    <section aria-label="Shopping with Cartix" className="container-page">
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <li key={i.title} className="card flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">{i.icon}</span>
            <span>
              <span className="block text-sm font-semibold">{i.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{i.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
