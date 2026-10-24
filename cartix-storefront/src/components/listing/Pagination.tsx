import Link from 'next/link';
import type { ListingParams } from '@/lib/api';
import type { ProductListing } from '@/lib/types';
import { listingHref } from './query';

export function Pagination({ meta, params, basePath }: { meta: ProductListing['meta']; params: ListingParams; basePath: string }) {
  if (meta.last_page <= 1) return null;
  const page = meta.current_page;
  const pages = Array.from({ length: meta.last_page }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === meta.last_page || Math.abs(p - page) <= 1,
  );
  const href = (p: number) => listingHref(basePath, params, { page: p === 1 ? null : String(p) });

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && <Link href={href(page - 1)} className="btn-outline px-3 py-2" rel="prev">Previous</Link>}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1]! > 1 && <span className="px-1 text-subtle">...</span>}
          <Link
            href={href(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`grid h-10 min-w-10 place-items-center rounded-lg border px-3 text-sm font-semibold ${p === page ? 'border-primary bg-primary text-white' : 'border-line bg-card hover:border-primary'}`}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < meta.last_page && <Link href={href(page + 1)} className="btn-outline px-3 py-2" rel="next">Next</Link>}
    </nav>
  );
}
