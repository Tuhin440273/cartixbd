'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Cart } from '@/lib/types';

interface CartContextValue {
  cart: Cart | null;
  loading: boolean;
  /** Re-reads the cart; pass a district and coupon to get a server quote. */
  refresh: (opts?: { districtId?: number | null; couponCode?: string | null }) => Promise<Cart | null>;
  addItem: (variantId: number, quantity: number) => Promise<{ ok: boolean; message?: string }>;
  updateItem: (itemId: number, quantity: number) => Promise<{ ok: boolean; message?: string }>;
  removeItem: (itemId: number) => Promise<{ ok: boolean; message?: string }>;
}

const CartContext = createContext<CartContextValue | null>(null);

async function send(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { message: 'Network error. Please check your connection and try again.' } };
  }
}

async function fetchCart(opts?: { districtId?: number | null; couponCode?: string | null }): Promise<Cart | null> {
  const qs = new URLSearchParams();
  if (opts?.districtId) qs.set('district_id', String(opts.districtId));
  if (opts?.couponCode) qs.set('coupon_code', opts.couponCode);
  const r = await send(`/api/cart${qs.size ? `?${qs}` : ''}`);
  return r.ok ? (r.body.data as Cart) : null;
}

export function errorMessage(body: Record<string, unknown>, fallback = 'Something went wrong. Please try again.'): string {
  const errors = body.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : undefined;
  return first ?? (typeof body.message === 'string' ? body.message : fallback);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback<CartContextValue['refresh']>(async (opts) => {
    const next = await fetchCart(opts);
    setLoading(false);
    if (next) setCart(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    fetchCart().then((next) => {
      if (!active) return;
      setLoading(false);
      if (next) setCart(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const mutate = useCallback(async (url: string, init: RequestInit) => {
    const r = await send(url, init);
    if (r.ok) {
      setCart(r.body.data as Cart);
      return { ok: true };
    }
    if (r.status === 404) void refresh();
    return { ok: false, message: errorMessage(r.body) };
  }, [refresh]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      refresh,
      addItem: (variantId, quantity) =>
        mutate('/api/cart/items', { method: 'POST', body: JSON.stringify({ variant_id: variantId, quantity }) }),
      updateItem: (itemId, quantity) =>
        mutate(`/api/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
      removeItem: (itemId) => mutate(`/api/cart/items/${itemId}`, { method: 'DELETE' }),
    }),
    [cart, loading, refresh, mutate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
