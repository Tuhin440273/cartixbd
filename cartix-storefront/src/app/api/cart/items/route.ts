import type { NextRequest } from 'next/server';
import { CART_COOKIE, callApi, cookieOptions, forbidden, privateJson, readJson, sameOrigin } from '@/lib/backend';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const input = await readJson(req);
  const { status, body } = await callApi(req, '/cart/items', {
    method: 'POST',
    body: { variant_id: input?.variant_id, quantity: input?.quantity },
  });

  // A new cart was created: keep its token in an httpOnly cookie and never send it to the page.
  const token = typeof body.cart_token === 'string' ? body.cart_token : null;
  delete body.cart_token;
  const res = privateJson(body, status);
  if (token) res.cookies.set(CART_COOKIE, token, cookieOptions(30));
  return res;
}
