import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getHome } from '@/lib/api';
import { ListingView } from '@/components/listing/ListingView';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { loadListing } from '@/lib/listing';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Only live collections that are on the home page can be opened; others return 404. */
async function collection(slug: string) {
  const c = (await getHome()).collections.find((x) => x.slug === slug);
  if (!c) notFound();
  return c;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await collection((await params).slug);
  return { title: c.name, alternates: { canonical: `/collections/${c.slug}` } };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const c = await collection((await params).slug);
  const query = await searchParams;
  const { listing, error } = await loadListing(query, { collection: c.slug });
  return (
    <>
      {error && <ErrorNote message={error} />}
      <ListingView title={c.name} crumbs={[{ name: c.name }]} listing={listing} params={query} basePath={`/collections/${c.slug}`} fixed={{ collection: c.slug }} />
    </>
  );
}
