import type { Metadata } from 'next';
import { ListingView } from '@/components/listing/ListingView';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { EmptyState } from '@/components/ui/EmptyState';
import { loadListing } from '@/lib/listing';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q;
  return {
    title: typeof q === 'string' && q ? `Search results for "${q.slice(0, 60)}"` : 'Search',
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  if (!q) {
    return (
      <div className="container-page py-10">
        <EmptyState level={1} title="What are you looking for?" text="Type a product name, category or brand in the search box above." action={{ href: '/products', label: 'Browse all products' }} />
      </div>
    );
  }
  const { listing, error } = await loadListing({ ...params, q });
  return (
    <>
      {error && <ErrorNote message={error} />}
      <ListingView title={`Results for "${q}"`} crumbs={[{ name: 'Search' }]} listing={listing} params={{ ...params, q }} basePath="/search" />
    </>
  );
}
