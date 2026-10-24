import type { NextRequest } from 'next/server';
import { callApi, cookieOptions, forbidden, orderCookieName, privateJson, readJson, sameOrigin } from '@/lib/backend';

const FIELDS = [
  'customer_name', 'customer_phone', 'customer_email', 'recipient_name', 'recipient_phone', 'district_id',
  'upazila_id', 'area_name', 'address_line', 'postcode', 'note', 'coupon_code', 'payment_method', 'accept_terms',
  'expected_total',
] as const;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const input = await readJson(req);
  if (!input) return privateJson({ message: 'Invalid request.' }, 400);

  // Only known fields are forwarded; prices are never taken from the browser.
  const payload: Record<string, unknown> = {};
  for (const f of FIELDS) if (input[f] !== undefined && input[f] !== '') payload[f] = input[f];

  const { status, body } = await callApi(req, '/checkout', {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': req.headers.get('idempotency-key') ?? '' },
  });

  const token = typeof body.access_token === 'string' ? body.access_token : null;
  delete body.access_token;
  const res = privateJson(body, status);
  const number = (body.data as { order_number?: string } | undefined)?.order_number;
  if (token && number) res.cookies.set(orderCookieName(number), token, cookieOptions(30));
  return res;
}
