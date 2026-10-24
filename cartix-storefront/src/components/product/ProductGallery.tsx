'use client';

import { useMemo, useState } from 'react';
import type { ProductDetail } from '@/lib/types';
import { SmartImage } from '@/components/ui/SmartImage';
import { galleryFor } from './variants';

/** Shows the photos for the chosen color (see galleryFor). */
export function ProductGallery({ images, name, product, selected, variantId }: {
  images: ProductDetail['gallery'];
  name: string;
  product: Pick<ProductDetail, 'variants' | 'options'>;
  selected: Record<string, number | undefined>;
  variantId: number | null;
}) {
  const shown = useMemo(
    () => galleryFor(images, product.variants, product.options, selected, variantId),
    [images, product.variants, product.options, selected, variantId],
  );
  // The chosen thumbnail resets to the first photo whenever the color or variant changes.
  const key = `${selected.color ?? ''}-${variantId ?? ''}`;
  const [choice, setChoice] = useState<{ key: string; index: number }>({ key, index: 0 });
  const active = choice.key === key ? choice.index : 0;
  const setActive = (index: number) => setChoice({ key, index });
  const current = shown[Math.min(active, shown.length - 1)];

  if (!current) {
    return <div className="card grid aspect-[4/5] place-items-center text-sm text-subtle">No image yet</div>;
  }

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {shown.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto sm:flex-col" aria-label="Product images">
          {shown.map((img, i) => (
            <li key={img.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${shown.length}${img.alt ? `: ${img.alt}` : ''}`}
                aria-pressed={i === active}
                className={`relative block h-20 w-16 overflow-hidden rounded-lg border-2 bg-card ${i === active ? 'border-primary' : 'border-line'}`}
              >
                <SmartImage src={img.url} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="card relative aspect-[4/5] flex-1 overflow-hidden">
        <SmartImage src={current.url} alt={current.alt || name} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
      </div>
    </div>
  );
}
