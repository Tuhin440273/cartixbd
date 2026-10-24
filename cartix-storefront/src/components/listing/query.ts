import type { ListingParams } from '@/lib/api';

/** Builds a listing URL from the current parameters with some values replaced or removed. */
export function listingHref(basePath: string, params: ListingParams, changes: Record<string, string | string[] | null>): string {
  const qs = new URLSearchParams();
  const merged: ListingParams = { ...params };
  for (const [k, v] of Object.entries(changes)) merged[k] = v === null ? undefined : v;
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export const asArray = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
