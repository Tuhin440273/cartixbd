import { describe, expect, it } from 'vitest';
import { listingQuery } from './api';

describe('listingQuery', () => {
  it('keeps only known parameters and encodes arrays for the API', () => {
    const qs = new URLSearchParams(listingQuery({ q: 'hoodie', size: ['M', 'L'], color: 'Black', evil: 'x', page: '2' }));
    expect(qs.get('q')).toBe('hoodie');
    expect(qs.getAll('size[]')).toEqual(['M', 'L']);
    expect(qs.getAll('color[]')).toEqual(['Black']);
    expect(qs.has('evil')).toBe(false);
    expect(qs.get('per_page')).toBe('24');
  });
  it('lets fixed values (from the route) override the query string', () => {
    const qs = new URLSearchParams(listingQuery({ category: 'women' }, { category: 'men' }));
    expect(qs.get('category')).toBe('men');
  });
});
