import { describe, expect, it } from 'vitest';
import type { OptionGroup, Variant } from '@/lib/types';
import { findVariant, galleryFor, initialSelection, valueAvailable } from './variants';

const groups: OptionGroup[] = [
  { code: 'color', name: 'Color', type: 'color', values: [{ id: 10, value: 'Black', hex: '#000' }, { id: 11, value: 'Navy', hex: '#123' }] },
  { code: 'size', name: 'Size', type: 'select', values: [{ id: 1, value: 'M', hex: null }, { id: 2, value: 'L', hex: null }] },
];
const v = (id: number, ids: number[], inStock = true, isDefault = false): Variant => ({
  id, sku: `S${id}`, label: '', price: '100.00', compare_at_price: null, option_value_ids: ids,
  in_stock: inStock, max_quantity: inStock ? 5 : 0, low_stock: false, is_default: isDefault,
});
const variants = [v(1, [10, 1], false, true), v(2, [10, 2]), v(3, [11, 1])];

describe('variant selection', () => {
  it('starts with an in-stock variant when the default is sold out', () => {
    expect(initialSelection(variants, groups)).toEqual({ color: 10, size: 2 });
  });
  it('finds the variant for a full selection only', () => {
    expect(findVariant(variants, { color: 11, size: 1 }, groups)?.id).toBe(3);
    expect(findVariant(variants, { color: 11 }, groups)).toBeNull();
    expect(findVariant(variants, { color: 11, size: 2 }, groups)).toBeNull();
  });
  it('marks values that cannot be bought with the other choices', () => {
    expect(valueAvailable(variants, groups, { color: 10, size: 2 }, 'size', 1)).toBe(false);
    expect(valueAvailable(variants, groups, { color: 11, size: 1 }, 'size', 1)).toBe(true);
    expect(valueAvailable(variants, groups, { color: 10, size: 1 }, 'color', 11)).toBe(true);
  });
});

describe('galleryFor', () => {
  // Variant 1 is Black/M, 2 is Black/L, 3 is Navy/M.
  const images = [
    { id: 'shared', variant_id: null },
    { id: 'black', variant_id: 1 },
    { id: 'navy', variant_id: 3 },
  ];
  const ids = (list: { id: string }[]) => list.map((i) => i.id);

  it('shows a color photo for every size of that color, followed by shared photos', () => {
    expect(ids(galleryFor(images, variants, groups, { color: 10, size: 2 }, 2))).toEqual(['black', 'shared']);
    expect(ids(galleryFor(images, variants, groups, { color: 11, size: 1 }, 3))).toEqual(['navy', 'shared']);
  });
  it('works when only the color is chosen', () => {
    expect(ids(galleryFor(images, variants, groups, { color: 11 }, null))).toEqual(['navy', 'shared']);
  });
  it('falls back to shared photos, then to all photos', () => {
    expect(ids(galleryFor(images.slice(1), variants, groups, {}, null))).toEqual(['black', 'navy']);
    expect(ids(galleryFor(images, variants, groups, {}, null))).toEqual(['shared']);
  });
});
