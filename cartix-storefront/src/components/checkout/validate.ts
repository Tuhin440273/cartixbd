import { normalizeBdPhone } from '@/lib/format';

export interface CheckoutFields {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  different_recipient: boolean;
  recipient_name: string;
  recipient_phone: string;
  division_id: string;
  district_id: string;
  upazila_id: string;
  area_name: string;
  address_line: string;
  postcode: string;
  note: string;
  payment_method: string;
}

export type FieldErrors = Partial<Record<keyof CheckoutFields | 'accept_terms' | 'coupon_code', string>>;

/** Client-side checks for quick feedback. The API validates everything again. */
export function validateCheckout(f: CheckoutFields, hasUpazilaList: boolean): FieldErrors {
  const e: FieldErrors = {};
  if (f.customer_name.trim().length < 2) e.customer_name = 'Please enter your full name.';
  if (!normalizeBdPhone(f.customer_phone)) e.customer_phone = 'Please enter a valid Bangladeshi mobile number, for example 01712345678.';
  if (f.customer_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.customer_email.trim())) e.customer_email = 'Please enter a valid email address or leave it empty.';
  if (f.different_recipient) {
    if (f.recipient_name.trim().length < 2) e.recipient_name = "Please enter the recipient's name.";
    if (!normalizeBdPhone(f.recipient_phone)) e.recipient_phone = "Please enter the recipient's mobile number.";
  }
  if (!f.division_id) e.division_id = 'Please choose a division.';
  if (!f.district_id) e.district_id = 'Please choose a district.';
  if (hasUpazilaList ? !f.upazila_id : f.area_name.trim().length < 2) {
    if (hasUpazilaList) e.upazila_id = 'Please choose an upazila or thana.';
    else e.area_name = 'Please enter your area, upazila or thana.';
  }
  if (f.address_line.trim().length < 5) e.address_line = 'Please enter your house, road and area details.';
  if (f.postcode.trim() && !/^\d{4}$/.test(f.postcode.trim())) e.postcode = 'The postcode must be 4 digits.';
  if (!f.payment_method) e.payment_method = 'Please choose a payment method.';
  return e;
}

/** Maps API field names to form field names. */
export function mapApiErrors(errors: Record<string, string[]> | undefined): FieldErrors {
  const out: FieldErrors = {};
  if (!errors) return out;
  for (const [k, v] of Object.entries(errors)) {
    if (v[0]) (out as Record<string, string>)[k] = v[0];
  }
  return out;
}
