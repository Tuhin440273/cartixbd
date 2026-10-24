import { describe, expect, it } from 'vitest';
import { mapApiErrors, validateCheckout, type CheckoutFields } from './validate';

const valid: CheckoutFields = {
  customer_name: 'Rakib Hasan', customer_phone: '01712345678', customer_email: '', different_recipient: false,
  recipient_name: '', recipient_phone: '', division_id: '3', district_id: '1', upazila_id: '', area_name: 'Mirpur',
  address_line: 'House 12, Road 5', postcode: '', note: '', payment_method: 'cod',
};

describe('validateCheckout', () => {
  it('accepts a complete form', () => {
    expect(validateCheckout(valid, false)).toEqual({});
  });
  it('reports missing and invalid fields in English', () => {
    const e = validateCheckout({ ...valid, customer_phone: '123', area_name: '', postcode: '12' }, false);
    expect(e.customer_phone).toMatch(/valid Bangladeshi mobile number/);
    expect(e.area_name).toBe('Please enter your area, upazila or thana.');
    expect(e.postcode).toBe('The postcode must be 4 digits.');
  });
  it('requires an upazila when the district has a list', () => {
    expect(validateCheckout(valid, true).upazila_id).toBe('Please choose an upazila or thana.');
  });
  it('requires recipient details when someone else receives the order', () => {
    const e = validateCheckout({ ...valid, different_recipient: true }, false);
    expect(Object.keys(e).sort()).toEqual(['recipient_name', 'recipient_phone']);
  });
});

describe('mapApiErrors', () => {
  it('takes the first message per field', () => {
    expect(mapApiErrors({ customer_phone: ['Bad number', 'Other'] })).toEqual({ customer_phone: 'Bad number' });
  });
});
