'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';
import { BagIcon } from '@/components/ui/icons';

export function CartButton() {
  const { cart } = useCart();
  const count = cart?.item_count ?? 0;
  return (
    <Link
      href="/cart"
      className="relative inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-primary-soft hover:text-primary"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
    >
      <BagIcon className="h-5 w-5" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-white sm:static sm:h-5">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
