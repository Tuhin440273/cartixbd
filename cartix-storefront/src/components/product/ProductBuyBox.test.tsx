import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProductDetail } from '@/lib/types';
import { CartProvider } from '@/components/cart/CartProvider';
import { ProductBuyBox } from './ProductBuyBox';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const product: ProductDetail = {
  id: 1, slug: 'zip-hoodie', name: 'Zip Hoodie', category: { name: 'Hoodies', slug: 'hoodies' }, brand: null,
  price: '1190.00', max_price: '1190.00', compare_at_price: null, discount_percent: null, in_stock: true, low_stock: false,
  image: null, hover_image: null, rail: null, colors: [], is_featured: false, short_description: null, description: null,
  breadcrumbs: [], gallery: [], rating: { average: 0, count: 0 }, meta: { title: '', description: '' },
  options: [{ code: 'size', name: 'Size', type: 'select', values: [{ id: 1, value: 'M', hex: null }, { id: 2, value: 'L', hex: null }] }],
  variants: [
    { id: 11, sku: 'ZH-M', label: 'M', price: '1190.00', compare_at_price: null, option_value_ids: [1], in_stock: true, max_quantity: 3, low_stock: true, is_default: true },
    { id: 12, sku: 'ZH-L', label: 'L', price: '1190.00', compare_at_price: null, option_value_ids: [2], in_stock: false, max_quantity: 0, low_stock: false, is_default: false },
  ],
};

const emptyCart = { item_count: 0, items: [], subtotal: '0.00', has_issues: false, can_checkout: false, quote: null, coupon: null };

describe('ProductBuyBox', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the selected variant with the chosen quantity through the cart API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === '/api/cart/items') {
        return new Response(JSON.stringify({ data: { ...emptyCart, item_count: 2 } }), { status: 201 });
      }
      return new Response(JSON.stringify({ data: emptyCart }), { status: 200 });
    });

    render(<CartProvider><ProductBuyBox product={product} /></CartProvider>);
    expect(screen.getByText('Only 3 left in stock')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await waitFor(() => expect(screen.getByText('Added to your cart.')).toBeTruthy());
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/cart/items');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ variant_id: 11, quantity: 2 });
  });

  it('disables adding an out-of-stock variant', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: emptyCart })));
    render(<CartProvider><ProductBuyBox product={product} /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'L (out of stock)' }));
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to cart' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server error message when adding fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url) === '/api/cart/items'
        ? new Response(JSON.stringify({ message: 'Only 1 left in stock.' }), { status: 422 })
        : new Response(JSON.stringify({ data: emptyCart })),
    );
    render(<CartProvider><ProductBuyBox product={product} /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(screen.getByText('Only 1 left in stock.')).toBeTruthy());
  });
});
