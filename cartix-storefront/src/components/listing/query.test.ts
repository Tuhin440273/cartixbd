import { describe, expect, it } from 'vitest';
import { listingHref } from './query';

describe('listingHref', () => {
  it('replaces and removes parameters', () => {
    expect(listingHref('/products', { sort: 'newest', page: '2', size: ['M', 'L'] }, { page: null })).toBe('/products?sort=newest&size=M&size=L');
    expect(listingHref('/products', {}, {})).toBe('/products');
  });
});
