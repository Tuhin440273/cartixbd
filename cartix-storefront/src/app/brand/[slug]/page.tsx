import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrands } from '@/lib/api';
import { ListingView } from '@/components/listing/ListingView';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { loadListing } from '@/lib/listing';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function brand(slug: string) {
  const b = (await getBrands()).find((x) => x.slug === slug);
  if (!b) notFound();
  return b;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await brand((await params).slug);
  return { title: b.name, description: `Shop ${b.name} at Cartix.`, alternates: { canonical: `/brand/${b.slug}` } };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const b = await brand((await params).slug);
  const query = await searchParams;
  const { listing, error } = await loadListing(query, { brand: b.slug });
  return (
    <>
      {error && <ErrorNote message={error} />}
      <ListingView title={b.name} crumbs={[{ name: 'Brands' }, { name: b.name }]} listing={listing} params={query} basePath={`/brand/${b.slug}`} fixed={{ brand: b.slug }} />
    </>
  );
}
