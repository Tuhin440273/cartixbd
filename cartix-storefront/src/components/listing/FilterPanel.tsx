import Link from 'next/link';
import type { ListingParams } from '@/lib/api';
import type { ListingFilters } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import { asArray } from './query';
import { ResponsiveDetails } from './ResponsiveDetails';

/**
 * Filters are a plain GET form, so they work without JavaScript and every filtered page has a
 * shareable URL. On small screens the panel is collapsed inside a details element.
 */
export function FilterPanel({
  filters,
  params,
  basePath,
  fixed,
}: {
  filters: ListingFilters;
  params: ListingParams;
  basePath: string;
  fixed: Record<string, string>;
}) {
  const sizes = asArray(params.size);
  const colors = asArray(params.color);
  const hasAny = filters.sizes.length + filters.colors.length + filters.brands.length > 0 || filters.price.min !== null;
  if (!hasAny) return <div className="hidden lg:block" />;

  return (
    <aside aria-label="Filters">
      <ResponsiveDetails className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold lg:cursor-default">
          Filters
          <span className="text-xs font-normal text-subtle">Show or hide</span>
        </summary>
        <form action={basePath} method="get" className="space-y-5 border-t border-line p-4 text-sm">
          {typeof params.q === 'string' && params.q && <input type="hidden" name="q" value={params.q} />}
          {typeof params.sort === 'string' && <input type="hidden" name="sort" value={params.sort} />}

          {filters.sizes.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-semibold">Size</legend>
              <div className="flex flex-wrap gap-2">
                {filters.sizes.map((s) => (
                  <label key={s} className="cursor-pointer">
                    <input type="checkbox" name="size" value={s} defaultChecked={sizes.includes(s)} className="peer sr-only" />
                    <span className="inline-grid h-9 min-w-10 place-items-center rounded-lg border border-line px-2 peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                      {s}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {filters.colors.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-semibold">Color</legend>
              <div className="space-y-1.5">
                {filters.colors.map((c) => (
                  <label key={c.name} className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" name="color" value={c.name} defaultChecked={colors.includes(c.name)} className="h-4 w-4 accent-primary" />
                    <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: c.hex ?? '#e2e8f0' }} aria-hidden="true" />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {!fixed.brand && filters.brands.length > 1 && (
            <fieldset>
              <legend className="mb-2 font-semibold">Brand</legend>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="brand" value="" defaultChecked={!params.brand} className="h-4 w-4 accent-primary" />
                  All brands
                </label>
                {filters.brands.map((b) => (
                  <label key={b.slug} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="brand" value={b.slug} defaultChecked={params.brand === b.slug} className="h-4 w-4 accent-primary" />
                    {b.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {filters.price.min !== null && filters.price.max !== null && (
            <fieldset>
              <legend className="mb-1 font-semibold">Price (Tk)</legend>
              <p className="mb-2 text-xs text-subtle">
                {formatPrice(filters.price.min)} to {formatPrice(filters.price.max)}
              </p>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="min_price">Minimum price</label>
                <input id="min_price" name="min_price" type="number" min={0} inputMode="numeric" placeholder="Min" defaultValue={typeof params.min_price === 'string' ? params.min_price : ''} className="input py-2" />
                <span aria-hidden="true">-</span>
                <label className="sr-only" htmlFor="max_price">Maximum price</label>
                <input id="max_price" name="max_price" type="number" min={0} inputMode="numeric" placeholder="Max" defaultValue={typeof params.max_price === 'string' ? params.max_price : ''} className="input py-2" />
              </div>
            </fieldset>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="in_stock" value="1" defaultChecked={params.in_stock === '1'} className="h-4 w-4 accent-primary" />
            In stock only
          </label>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">Apply</button>
            <Link href={basePath + (typeof params.q === 'string' && params.q ? `?q=${encodeURIComponent(params.q)}` : '')} className="btn-outline">
              Clear
            </Link>
          </div>
        </form>
      </ResponsiveDetails>
    </aside>
  );
}
