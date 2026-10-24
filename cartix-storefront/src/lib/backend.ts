import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from './api';

/** httpOnly cookie that holds the guest cart token. JavaScript in the page can never read it. */
export const CART_COOKIE = 'cartix_cart';
/** Prefix of the httpOnly cookies that let a guest reopen the confirmation page of their own orders. */
export const ORDER_COOKIE_PREFIX = 'cartix_order_';

const secure = process.env.CARTIX_SECURE_COOKIES
  ? process.env.CARTIX_SECURE_COOKIES === 'true'
  : process.env.NODE_ENV === 'production';

export const cookieOptions = (maxAgeDays: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
  path: '/',
  maxAge: maxAgeDays * 24 * 60 * 60,
});

export const orderCookieName = (orderNumber: string) =>
  ORDER_COOKIE_PREFIX + orderNumber.replace(/[^A-Za-z0-9-]/g, '');

/**
 * Rejects state-changing requests that come from another site. SameSite=Lax cookies already stop
 * most cross-site requests; this is a second, explicit check.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const forbidden = () => NextResponse.json({ message: 'This request was blocked.' }, { status: 403 });

/** Calls the Laravel API from the server, adding the cart token and the client's address. */
export async function callApi(
  req: NextRequest,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const jar = await cookies();
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
  const cart = jar.get(CART_COOKIE)?.value;
  if (cart) headers['X-Cart-Token'] = cart;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  // Laravel uses this for rate limiting and the order's IP address when TRUSTED_PROXIES includes this server.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) headers['X-Forwarded-For'] = forwarded;

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } catch {
    return { status: 503, body: { message: 'The store is temporarily unavailable. Please try again shortly.' } };
  }
}

/** JSON response that must never be cached (carts and orders are private). */
export function privateJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
