import 'server-only';
import type { CategoryNode, Division, HomeData, ProductDetail, ProductListing, Review, ProductCard } from './types';

export const API_URL = (process.env.CARTIX_API_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown = null,
  ) {
    super(message);
  }
}

/**
 * Public catalog reads from the Laravel API. Responses are cached by Next.js for a short time,
 * so product, price and stock changes appear within about a minute.
 */
async function getJson<T>(path: string, revalidate = 60): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate, tags: ['catalog'] },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = (body as { message?: string } | null)?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return (await res.json()) as T;
}

export const getHome = () => getJson<HomeData>('/home');
export const getCategories = () => getJson<{ data: CategoryNode[] }>('/categories', 300).then((r) => r.data);
export const getBrands = () =>
  getJson<{ data: { name: string; slug: string; product_count: number }[] }>('/brands', 300).then((r) => r.data);
export const getCategory = (slug: string) =>
  getJson<{
    data: { id: number; name: string; slug: string; parent: { name: string; slug: string } | null; children: { name: string; slug: string }[] };
  }>(`/categories/${encodeURIComponent(slug)}`, 300).then((r) => r.data);
export const getProduct = (slug: string) =>
  getJson<{ data: ProductDetail; reviews: Review[]; related: ProductCard[] }>(`/products/${encodeURIComponent(slug)}`);
export const getDivisions = () => getJson<{ data: Division[] }>('/locations/divisions', 3600).then((r) => r.data);
export const getCheckoutOptions = () =>
  getJson<{ data: { payment_methods: { code: string; label: string }[]; max_quantity_per_item: number } }>(
    '/checkout/options',
    300,
  ).then((r) => r.data);

export type ListingParams = Record<string, string | string[] | undefined>;

const ALLOWED = ['q', 'category', 'brand', 'collection', 'min_price', 'max_price', 'size', 'color', 'in_stock', 'sort', 'page'];

export function listingQuery(params: ListingParams, fixed: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  for (const key of ALLOWED) {
    const value = fixed[key] ?? params[key];
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) value.filter(Boolean).forEach((v) => qs.append(`${key}[]`, v));
    else if (key === 'size' || key === 'color') qs.append(`${key}[]`, value);
    else qs.set(key, value);
  }
  qs.set('per_page', '24');
  return qs.toString();
}

export const getProducts = (params: ListingParams, fixed: Record<string, string> = {}) =>
  getJson<ProductListing>(`/products?${listingQuery(params, fixed)}`);
