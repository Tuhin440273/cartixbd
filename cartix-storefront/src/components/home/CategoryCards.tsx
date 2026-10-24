import Link from 'next/link';
import type { HomeData } from '@/lib/types';
import { SmartImage } from '@/components/ui/SmartImage';
import { SectionHeading } from '@/components/ui/SectionHeading';

export function CategoryCards({ categories }: { categories: HomeData['categories'] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="shop-by-category" className="container-page">
      <SectionHeading id="shop-by-category" title="Shop by category" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/category/${c.slug}`} className="group card flex items-center gap-3 p-3 transition-shadow hover:shadow-md">
              <span className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-page">
                {c.image && <SmartImage src={c.image.url} alt="" fill sizes="56px" className="object-contain p-1" />}
              </span>
              <span>
                <span className="block font-semibold group-hover:text-primary">{c.name}</span>
                <span className="text-xs text-subtle">
                  {c.product_count} product{c.product_count === 1 ? '' : 's'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
