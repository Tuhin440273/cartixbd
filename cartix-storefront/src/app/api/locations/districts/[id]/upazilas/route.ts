import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ data: [] }, { status: 404 });
  const res = await fetch(`${API_URL}/locations/districts/${id}/upazilas`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!res) return NextResponse.json({ data: [] }, { status: 503 });
  const body: unknown = await res.json().catch(() => ({ data: [] }));
  return NextResponse.json(body, { status: res.status, headers: { 'Cache-Control': 'public, max-age=3600' } });
}
