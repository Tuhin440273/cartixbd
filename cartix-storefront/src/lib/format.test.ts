import { describe, expect, it } from 'vitest';
import { deliveryDays, formatPrice, normalizeBdPhone } from './format';

describe('formatPrice', () => {
  it('formats whole taka without decimals', () => {
    expect(formatPrice('1250.00')).toBe('Tk 1,250');
    expect(formatPrice(70)).toBe('Tk 70');
  });
  it('keeps paisa when present', () => {
    expect(formatPrice('99.50')).toBe('Tk 99.50');
  });
  it('returns an empty string for missing or invalid values', () => {
    expect(formatPrice(null)).toBe('');
    expect(formatPrice('abc')).toBe('');
  });
});

describe('normalizeBdPhone', () => {
  it('accepts common Bangladeshi formats', () => {
    expect(normalizeBdPhone('01712345678')).toBe('01712345678');
    expect(normalizeBdPhone('+880 1712-345678')).toBe('01712345678');
    expect(normalizeBdPhone('1712345678')).toBe('01712345678');
  });
  it('rejects invalid numbers', () => {
    expect(normalizeBdPhone('01212345678')).toBeNull();
    expect(normalizeBdPhone('12345')).toBeNull();
  });
});

describe('deliveryDays', () => {
  it('describes delivery ranges', () => {
    expect(deliveryDays(1, 2)).toBe('1-2 days');
    expect(deliveryDays(2, 2)).toBe('2 days');
    expect(deliveryDays(null, null)).toBe('');
  });
});
