import { getHome } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { CategoryCards } from '@/components/home/CategoryCards';
import { TrustStrip } from '@/components/home/TrustStrip';
import { HangingRail } from '@/components/home/HangingRail';
import { ProductGrid } from '@/components/product/ProductCard';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ProductCard } from '@/lib/types';



function Section({ id, title, href, products }: { id: string; title: string; href: string; products: ProductCard[] }) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className="container-page">
      <SectionHeading id={id} title={title} href={href} />
      <ProductGrid products={products} />
    </section>
  );
}

export default async function HomePage() {
  const home = await getHome();
  const hero = home.banners[0];
  const rails = home.collections.filter((c) => c.type === 'rail');
  const sections = home.collections.filter((c) => c.type !== 'rail');
  const nothing = home.featured.length === 0 && home.new_arrivals.length === 0;

  return (
    <div className="space-y-12 pb-4 sm:space-y-14">
      <h1 className="sr-only">Cartix online shop</h1>
      {hero && <HeroBanner banner={hero} />}
      <CategoryCards categories={home.categories} />
      {nothing && (
        <div className="container-page">
          <EmptyState title="New products are on their way" text="Our shelves are being stocked. Please check back soon." />
        </div>
      )}
      <Section id="featured" title="Featured" href="/products?sort=featured" products={home.featured} />
      {rails.map((r) => (
        <HangingRail
          key={r.slug}
          title={r.name}
          eyebrow="On the rail"
          subtitle="Hover over a garment to turn it around. Click to see sizes and details."
          products={r.products}
        />
      ))}
      <Section id="new-arrivals" title="New arrivals" href="/products?sort=newest" products={home.new_arrivals} />
      <Section id="best-sellers" title="Best sellers" href="/products?sort=best_selling" products={home.best_sellers} />
      {sections.map((c) => (
        <Section key={c.slug} id={`collection-${c.slug}`} title={c.name} href={`/collections/${c.slug}`} products={c.products.slice(0, 8)} />
      ))}
      <TrustStrip store={home.store} />
    </div>
  );
}
