import Link from 'next/link';
import type { ListingParams } from '@/lib/api';
import type { ProductListing } from '@/lib/types';
import { ProductGrid } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterPanel } from './FilterPanel';
import { SortSelect } from './SortSelect';
import { Pagination } from './Pagination';

export interface Crumb {
  name: string;
  href?: string;
}

/** Shared listing layout for all products, categories, brands, collections and search. */
export function ListingView({
  title,
  description,
  crumbs,
  listing,
  params,
  basePath,
  fixed = {},
}: {
  title: string;
  description?: string;
  crumbs: Crumb[];
  listing: ProductListing;
  params: ListingParams;
  basePath: string;
  fixed?: Record<string, string>;
}) {
  const { meta } = listing;
  const activeFilters = ['size', 'color', 'brand', 'min_price', 'max_price', 'in_stock'].some(
    (k) => !fixed[k] && params[k] !== undefined && params[k] !== '',
  );

  return (
    <div className="container-page py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-subtle">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-primary">Home</Link></li>
          {crumbs.map((c) => (
            <li key={c.name} className="flex items-center gap-1.5">
              <span aria-hidden="true">/</span>
              {c.href ? <Link href={c.href} className="hover:text-primary">{c.name}</Link> : <span aria-current="page" className="text-ink">{c.name}</span>}
            </li>
          ))}
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          <p className="mt-1 text-sm text-subtle" aria-live="polite">
            {meta.total} product{meta.total === 1 ? '' : 's'}
          </p>
        </div>
        <SortSelect sorts={listing.sorts} current={typeof params.sort === 'string' ? params.sort : 'featured'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <FilterPanel filters={listing.filters} params={params} basePath={basePath} fixed={fixed} />
        <div>
          {listing.data.length > 0 ? (
            <>
              <ProductGrid products={listing.data} priorityCount={4} />
              <Pagination meta={meta} params={params} basePath={basePath} />
            </>
          ) : (
            <EmptyState
              title="No products found"
              text={activeFilters ? 'Try removing some filters.' : 'There are no products here yet. Please check back soon.'}
              action={activeFilters ? { href: basePath + (params.q ? `?q=${encodeURIComponent(String(params.q))}` : ''), label: 'Clear filters' } : { href: '/products', label: 'Browse all products' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
