import type { MetadataRoute } from 'next';
import { getCategories, getProducts } from '@/lib/api';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;

/** Home, listing pages, categories and every visible product (paged through the API). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: 'daily', priority: 0.8 },
  ];
  try {
    const categories = await getCategories();
    for (const c of categories) {
      entries.push({ url: `${SITE_URL}/category/${c.slug}`, changeFrequency: 'daily', priority: 0.7 });
      for (const ch of c.children) {
        if (ch.product_count > 0) entries.push({ url: `${SITE_URL}/category/${ch.slug}`, changeFrequency: 'daily', priority: 0.6 });
      }
    }
    let page = 1;
    let last = 1;
    do {
      const listing = await getProducts({ page: String(page), sort: 'newest' });
      listing.data.forEach((p) => entries.push({ url: `${SITE_URL}/product/${p.slug}`, changeFrequency: 'weekly', priority: 0.6 }));
      last = Math.min(listing.meta.last_page, 200);
      page++;
    } while (page <= last);
  } catch {
    // The sitemap still lists the main pages when the API is unavailable.
  }
  return entries;
}
