import type { NextRequest } from 'next/server';
import { callApi, forbidden, privateJson, readJson, sameOrigin } from '@/lib/backend';

type Ctx = { params: Promise<{ id: string }> };

const badId = () => privateJson({ message: 'This item is not in your cart.' }, 404);

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) return forbidden();
  const { id } = await params;
  if (!/^\d+$/.test(id)) return badId();
  const input = await readJson(req);
  const { status, body } = await callApi(req, `/cart/items/${id}`, { method: 'PATCH', body: { quantity: input?.quantity } });
  return privateJson(body, status);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) return forbidden();
  const { id } = await params;
  if (!/^\d+$/.test(id)) return badId();
  const { status, body } = await callApi(req, `/cart/items/${id}`, { method: 'DELETE' });
  return privateJson(body, status);
}
