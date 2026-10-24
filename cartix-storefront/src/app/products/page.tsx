import type { Metadata } from 'next';
import { ListingView } from '@/components/listing/ListingView';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { loadListing } from '@/lib/listing';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = {
  title: 'All products',
  description: 'Browse all clothing and cosmetics at Cartix.',
  alternates: { canonical: '/products' },
};

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { listing, error } = await loadListing(params);
  return (
    <>
      {error && <ErrorNote message={error} />}
      <ListingView title="All products" crumbs={[{ name: 'All products' }]} listing={listing} params={params} basePath="/products" />
    </>
  );
}
