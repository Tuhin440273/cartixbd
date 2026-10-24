import Link from 'next/link';
import { getCategories, getHome } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import type { CategoryNode } from '@/lib/types';
import { CartButton } from '@/components/cart/CartButton';
import { SearchForm } from './SearchForm';
import { MobileNav } from './MobileNav';
import { Logo } from './Logo';
import { UserIcon } from '@/components/ui/icons';

async function loadNav(): Promise<{ categories: CategoryNode[]; deliveryFrom: string | null; cod: boolean }> {
  try {
    const [categories, home] = await Promise.all([getCategories(), getHome()]);
    return {
      categories: categories.filter((c) => c.product_count > 0),
      deliveryFrom: home.store.delivery_from,
      cod: home.store.payment_methods.some((m) => m.code === 'cod'),
    };
  } catch {
    return { categories: [], deliveryFrom: null, cod: false };
  }
}

export async function Header() {
  const { categories, deliveryFrom, cod } = await loadNav();
  const announcement = [
    cod ? 'Cash on delivery across Bangladesh' : null,
    deliveryFrom ? `Delivery from ${formatPrice(deliveryFrom)}` : null,
  ].filter(Boolean);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      {announcement.length > 0 && (
        <div className="bg-ink text-white">
          <p className="container-page py-2 text-center text-xs font-medium tracking-wide">{announcement.join('  ·  ')}</p>
        </div>
      )}
      <div className="container-page flex h-16 items-center gap-3 sm:gap-6">
        <MobileNav categories={categories} />
        <Logo />
        <div className="hidden flex-1 md:block">
          <SearchForm />
        </div>
        <nav className="ml-auto flex items-center gap-1" aria-label="Account and cart">
          <Link
            href="/track-order"
            className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-primary-soft hover:text-primary"
          >
            <UserIcon className="h-5 w-5" />
            <span className="hidden lg:inline">Track order</span>
            <span className="sr-only lg:hidden">Track order</span>
          </Link>
          <CartButton />
        </nav>
      </div>
      <div className="container-page pb-3 md:hidden">
        <SearchForm />
      </div>
      {categories.length > 0 && (
        <nav aria-label="Categories" className="hidden border-t border-line md:block">
          <ul className="container-page flex h-11 items-center gap-1 text-sm">
            {categories.map((c) => (
              <li key={c.slug} className="group relative">
                <Link href={`/category/${c.slug}`} className="inline-flex h-11 items-center px-3 font-medium text-muted hover:text-primary">
                  {c.name}
                </Link>
                {c.children.some((ch) => ch.product_count > 0) && (
                  <div className="invisible absolute left-0 top-full z-50 min-w-48 rounded-xl border border-line bg-card p-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <Link href={`/category/${c.slug}`} className="block rounded-lg px-3 py-2 font-semibold hover:bg-page">
                      All {c.name}
                    </Link>
                    {c.children.filter((ch) => ch.product_count > 0).map((ch) => (
                      <Link key={ch.slug} href={`/category/${ch.slug}`} className="block rounded-lg px-3 py-2 text-muted hover:bg-page hover:text-ink">
                        {ch.name}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
            <li>
              <Link href="/products?sort=newest" className="inline-flex h-11 items-center px-3 font-medium text-muted hover:text-primary">
                New arrivals
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
