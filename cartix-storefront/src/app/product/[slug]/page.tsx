import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiError, getProduct } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SITE_URL } from '@/lib/config';
import { ProductBuyBox } from '@/components/product/ProductBuyBox';
import { ProductGrid } from '@/components/product/ProductCard';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { StarIcon } from '@/components/ui/icons';

type Props = { params: Promise<{ slug: string }> };

const load = cache(async (slug: string) => {
  try {
    return await getProduct(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: p } = await load((await params).slug);
  const image = p.image?.url;
  return {
    title: p.name,
    description: p.meta.description || p.short_description || undefined,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title: p.name, description: p.meta.description, images: image ? [{ url: image, alt: p.image?.alt }] : undefined },
  };
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex text-amber-500" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} className="h-4 w-4" filled={i <= Math.round(value)} />
      ))}
    </span>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const { data: product, reviews, related } = await load(slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.meta.description,
    image: product.gallery.map((g) => g.url),
    sku: product.variants[0]?.sku,
    brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
    offers: product.variants.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      price: v.price,
      priceCurrency: 'BDT',
      availability: v.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/product/${product.slug}`,
    })),
    ...(product.rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating.average, reviewCount: product.rating.count } }
      : {}),
  };

  return (
    <div className="container-page py-6">
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-subtle">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-primary">Home</Link></li>
          {product.breadcrumbs.map((b) => (
            <li key={b.slug} className="flex items-center gap-1.5">
              <span aria-hidden="true">/</span>
              <Link href={`/category/${b.slug}`} className="hover:text-primary">{b.name}</Link>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-ink">{product.name}</span>
          </li>
        </ol>
      </nav>

      <ProductBuyBox product={product}>
        {product.description && (
          <section aria-labelledby="details" className="border-t border-line pt-5">
            <h2 id="details" className="mb-2 font-semibold">Product details</h2>
            <div className="whitespace-pre-line text-sm leading-relaxed text-muted">{product.description}</div>
          </section>
        )}
      </ProductBuyBox>

      <section id="reviews" aria-labelledby="reviews-title" className="mt-12">
        <h2 id="reviews-title" className="mb-4 text-xl font-bold">Customer reviews</h2>
        {reviews.length === 0 ? (
          <p className="card p-5 text-sm text-muted">No reviews yet. Reviews come from customers who received this product.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {reviews.map((r) => (
              <li key={r.id} className="card space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Stars value={r.rating} />
                  <span className="text-xs text-subtle">{formatDate(r.created_at)}</span>
                </div>
                {r.comment && <p className="text-sm">{r.comment}</p>}
                <p className="text-xs font-medium text-muted">{r.author}</p>
                {r.vendor_reply && <p className="rounded-lg bg-page p-3 text-xs text-muted"><span className="font-semibold text-ink">Seller reply: </span>{r.vendor_reply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-12">
          <SectionHeading id="related" title="You may also like" href={product.category ? `/category/${product.category.slug}` : undefined} />
          <ProductGrid products={related.slice(0, 8)} />
        </section>
      )}
    </div>
  );
}
