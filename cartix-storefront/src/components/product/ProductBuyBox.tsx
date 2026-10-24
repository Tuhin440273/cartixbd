'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ProductDetail } from '@/lib/types';
import { useCart } from '@/components/cart/CartProvider';
import { ProductGallery } from './ProductGallery';
import { Price } from './Price';
import { findVariant, initialSelection, valueAvailable } from './variants';
import { CheckIcon } from '@/components/ui/icons';

export function ProductBuyBox({ product, children }: { product: ProductDetail; children?: React.ReactNode }) {
  const { addItem } = useCart();
  const groups = product.options;
  const [selected, setSelected] = useState<Record<string, number | undefined>>(() => initialSelection(product.variants, groups));
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const variant = useMemo(() => findVariant(product.variants, selected, groups), [product.variants, selected, groups]);
  const max = variant?.max_quantity ?? 0;

  const choose = (code: string, id: number) => {
    setSelected((s) => ({ ...s, [code]: id }));
    setQty(1);
    setStatus(null);
  };

  const add = async () => {
    if (!variant || busy) return;
    setBusy(true);
    setStatus(null);
    const r = await addItem(variant.id, qty);
    setBusy(false);
    setStatus(r.ok ? { ok: true, text: 'Added to your cart.' } : { ok: false, text: r.message ?? 'Could not add this item.' });
  };

  const missing = groups.filter((g) => selected[g.code] === undefined).map((g) => g.name.toLowerCase());

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <ProductGallery images={product.gallery} name={product.name} product={product} selected={selected} variantId={variant?.id ?? null} />

      <div className="space-y-5">
        <div className="space-y-2">
          {product.brand && (
            <Link href={`/brand/${product.brand.slug}`} className="text-sm font-semibold uppercase tracking-wide text-primary">
              {product.brand.name}
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{product.name}</h1>
          {product.rating.count > 0 && (
            <a href="#reviews" className="text-sm text-muted hover:text-primary">
              Rated {product.rating.average.toFixed(1)} out of 5 ({product.rating.count} review{product.rating.count === 1 ? '' : 's'})
            </a>
          )}
        </div>

        <Price
          size="lg"
          price={variant?.price ?? product.price}
          maxPrice={variant ? null : product.max_price}
          compareAt={variant ? variant.compare_at_price : product.compare_at_price}
        />

        {product.short_description && <p className="text-muted">{product.short_description}</p>}

        {groups.map((g) => {
          const current = g.values.find((v) => v.id === selected[g.code]);
          return (
            <fieldset key={g.code}>
              <legend className="mb-2 text-sm font-semibold">
                {g.name}
                {current && <span className="font-normal text-muted">: {current.value}</span>}
              </legend>
              <div className="flex flex-wrap gap-2">
                {g.values.map((v) => {
                  const available = valueAvailable(product.variants, groups, selected, g.code, v.id);
                  const isSelected = selected[g.code] === v.id;
                  return g.type === 'color' ? (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => choose(g.code, v.id)}
                      aria-pressed={isSelected}
                      aria-label={`${v.value}${available ? '' : ' (out of stock)'}`}
                      title={v.value}
                      className={`relative h-10 w-10 rounded-full border-2 ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-line'} ${available ? '' : 'opacity-40'}`}
                      style={{ backgroundColor: v.hex ?? '#e2e8f0' }}
                    >
                      {!available && <span aria-hidden="true" className="absolute inset-x-1 top-1/2 h-0.5 -rotate-45 bg-ink" />}
                    </button>
                  ) : (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => choose(g.code, v.id)}
                      aria-pressed={isSelected}
                      aria-label={`${v.value}${available ? '' : ' (out of stock)'}`}
                      className={`h-10 min-w-12 rounded-lg border px-3 text-sm font-semibold ${isSelected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-card'} ${available ? '' : 'text-subtle line-through'}`}
                    >
                      {v.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div aria-live="polite" className="text-sm">
          {!variant && missing.length > 0 && <p className="text-muted">Please choose a {missing.join(' and ')}.</p>}
          {!variant && missing.length === 0 && <p className="text-danger">This combination is not available.</p>}
          {variant && !variant.in_stock && <p className="font-medium text-danger">Out of stock</p>}
          {variant && variant.in_stock && variant.low_stock && <p className="font-medium text-warning">Only {variant.max_quantity} left in stock</p>}
          {variant && variant.in_stock && !variant.low_stock && <p className="font-medium text-success">In stock</p>}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="qty" className="label">Quantity</label>
            <div className="flex h-11 items-center rounded-lg border border-line bg-card">
              <button type="button" className="h-full w-11 text-lg disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">-</button>
              <input
                id="qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, max)}
                value={qty}
                onChange={(e) => setQty(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, max)))}
                className="h-full w-14 border-x border-line text-center text-sm [appearance:textfield]"
              />
              <button type="button" className="h-full w-11 text-lg disabled:opacity-40" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="Increase quantity">+</button>
            </div>
          </div>
          <button type="button" className="btn-primary h-11 flex-1 sm:flex-none sm:px-8" onClick={add} disabled={!variant || !variant.in_stock || busy}>
            {busy ? 'Adding...' : 'Add to cart'}
          </button>
        </div>

        {status && (
          <div role="status" className={`flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm ${status.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
            {status.ok && <CheckIcon className="h-5 w-5" />}
            <span className="font-medium">{status.text}</span>
            {status.ok && <Link href="/cart" className="ml-auto font-semibold underline">View cart</Link>}
          </div>
        )}

        {variant && <p className="text-xs text-subtle">SKU: {variant.sku}</p>}
        {children}
      </div>
    </div>
  );
}
