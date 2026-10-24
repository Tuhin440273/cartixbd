import 'server-only';
import { notFound } from 'next/navigation';
import { ApiError, getProducts, type ListingParams } from './api';
import type { ProductListing } from './types';

const EMPTY: ProductListing = {
  data: [],
  meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 },
  filters: { sizes: [], colors: [], brands: [], price: { min: null, max: null } },
  sorts: [],
};

/** Loads a listing; a 404 from the API becomes the not-found page, invalid filters show an empty list with a message. */
export async function loadListing(params: ListingParams, fixed: Record<string, string> = {}): Promise<{ listing: ProductListing; error: string | null }> {
  try {
    return { listing: await getProducts(params, fixed), error: null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && e.status === 422) return { listing: EMPTY, error: e.message };
    throw e;
  }
}
