import type { NextRequest } from 'next/server';
import { callApi, forbidden, privateJson, readJson, sameOrigin } from '@/lib/backend';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const input = await readJson(req);
  const { status, body } = await callApi(req, '/orders/lookup', {
    method: 'POST',
    body: { order_number: input?.order_number, phone: input?.phone },
  });
  return privateJson(body, status);
}
