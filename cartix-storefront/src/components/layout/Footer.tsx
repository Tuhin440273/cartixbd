import Link from 'next/link';
import { Logo } from './Logo';
import { getHome } from '@/lib/api';

export async function Footer() {
  const methods = await getHome().then((h) => h.store.payment_methods).catch(() => []);
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-card">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">Clothing and cosmetics, delivered across Bangladesh.</p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Shop</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-primary" href="/products">All products</Link></li>
            <li><Link className="hover:text-primary" href="/products?sort=newest">New arrivals</Link></li>
            <li><Link className="hover:text-primary" href="/products?sort=best_selling">Best sellers</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Help</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-primary" href="/track-order">Track your order</Link></li>
            <li><Link className="hover:text-primary" href="/cart">Your cart</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Payment options</h2>
          <ul className="space-y-2 text-sm text-muted">
            {methods.map((m) => <li key={m.code}>{m.label}</li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="container-page py-4 text-xs text-subtle">&copy; {year} Cartix. All rights reserved.</p>
      </div>
    </footer>
  );
}
