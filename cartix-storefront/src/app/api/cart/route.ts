import type { NextRequest } from 'next/server';
import { callApi, forbidden, privateJson, sameOrigin } from '@/lib/backend';

export async function GET(req: NextRequest) {
  const qs = new URLSearchParams();
  const district = req.nextUrl.searchParams.get('district_id');
  const coupon = req.nextUrl.searchParams.get('coupon_code');
  if (district && /^\d+$/.test(district)) qs.set('district_id', district);
  if (coupon) qs.set('coupon_code', coupon.slice(0, 50));
  const { status, body } = await callApi(req, `/cart${qs.size ? `?${qs}` : ''}`);
  return privateJson(body, status);
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const { status, body } = await callApi(req, '/cart', { method: 'DELETE' });
  return privateJson(body, status);
}
