'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { CategoryNode } from '@/lib/types';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { Logo } from './Logo';

export function MobileNav({ categories }: { categories: CategoryNode[] }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-page md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
      >
        <MenuIcon className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-menu">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <Logo size="sm" />
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-page" aria-label="Close menu" onClick={() => setOpen(false)} autoFocus>
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>
            <nav aria-label="Mobile categories" className="space-y-4 text-sm">
              <Link href="/products?sort=newest" className="block font-semibold">New arrivals</Link>
              {categories.map((c) => (
                <div key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="block font-semibold">{c.name}</Link>
                  <ul className="mt-2 space-y-1 border-l border-line pl-3">
                    {c.children.filter((ch) => ch.product_count > 0).map((ch) => (
                      <li key={ch.slug}>
                        <Link href={`/category/${ch.slug}`} className="block py-1 text-muted">{ch.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Link href="/track-order" className="block border-t border-line pt-4 font-semibold">Track your order</Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
