import Link from 'next/link';
import type { Banner } from '@/lib/types';

/** Banner artwork comes from the admin; the title is the accessible name of the link. */
export function HeroBanner({ banner }: { banner: Banner }) {
  const picture = (
    <picture>
      {banner.image_mobile && <source media="(max-width: 640px)" srcSet={banner.image_mobile} />}
      <img
        src={banner.image_desktop ?? banner.image_mobile ?? ''}
        alt={banner.title}
        className="h-auto w-full rounded-2xl object-cover"
        fetchPriority="high"
      />
    </picture>
  );
  return (
    <section aria-label="Featured promotion" className="container-page pt-4 sm:pt-6">
      {banner.link_url ? (
        <Link href={banner.link_url} className="block overflow-hidden rounded-2xl">
          {picture}
        </Link>
      ) : (
        picture
      )}
    </section>
  );
}
