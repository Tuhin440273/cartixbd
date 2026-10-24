import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, getCategory } from '@/lib/api';
import { ListingView, type Crumb } from '@/components/listing/ListingView';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { loadListing } from '@/lib/listing';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function category(slug: string) {
  try {
    return await getCategory(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await category((await params).slug);
  return {
    title: c.name,
    description: `Shop ${c.name.toLowerCase()} online at Cartix with delivery across Bangladesh.`,
    alternates: { canonical: `/category/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const c = await category(slug);
  const { listing, error } = await loadListing(query, { category: c.slug });
  const crumbs: Crumb[] = [...(c.parent ? [{ name: c.parent.name, href: `/category/${c.parent.slug}` }] : []), { name: c.name }];

  return (
    <>
      {error && <ErrorNote message={error} />}
      {c.children.length > 0 && (
        <div className="container-page pt-6">
          <ul className="flex flex-wrap gap-2" aria-label={`${c.name} subcategories`}>
            {c.children.map((ch) => (
              <li key={ch.slug}>
                <Link href={`/category/${ch.slug}`} className="inline-flex rounded-full border border-line bg-card px-4 py-1.5 text-sm font-medium hover:border-primary hover:text-primary">
                  {ch.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ListingView title={c.name} crumbs={crumbs} listing={listing} params={query} basePath={`/category/${c.slug}`} fixed={{ category: c.slug }} />
    </>
  );
}
