import Link from 'next/link';
import type { ProductCard as Card } from '@/lib/types';
import { SmartImage } from '@/components/ui/SmartImage';
import { Price } from './Price';

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  return (
    <article className="group card relative flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/5] bg-page">
        {product.image ? (
          <>
            <SmartImage
              src={product.image.url}
              alt={product.image.alt || product.name}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className={`object-cover transition-opacity duration-300 ${product.hover_image ? 'group-hover:opacity-0' : ''}`}
              priority={priority}
            />
            {product.hover_image && (
              <SmartImage
                src={product.hover_image.url}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-subtle">No image yet</div>
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.discount_percent ? (
            <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-bold text-white">-{product.discount_percent}%</span>
          ) : null}
          {!product.in_stock && <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-semibold text-white">Out of stock</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.category && <p className="text-xs font-medium uppercase tracking-wide text-subtle">{product.category.name}</p>}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0 focus:outline-none">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto space-y-1.5">
          <Price price={product.price} maxPrice={product.max_price} compareAt={product.compare_at_price} />
          {product.colors.length > 1 && (
            <div className="flex items-center gap-1" aria-label={`${product.colors.length} colors`}>
              {product.colors.slice(0, 5).map((c) => (
                <span key={c.name} title={c.name} className="h-3.5 w-3.5 rounded-full border border-line" style={{ backgroundColor: c.hex ?? '#e2e8f0' }} />
              ))}
            </div>
          )}
          {product.in_stock && product.low_stock && <p className="text-xs font-medium text-warning">Only a few left</p>}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <div className="w-full">
            <ProductCard product={p} priority={i < priorityCount} />
          </div>
        </li>
      ))}
    </ul>
  );
}
