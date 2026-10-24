/** Formats a decimal amount from the API ("1250.00") as "Tk 1,250". Never used for calculations. */
export function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  const hasPaisa = Math.round(n * 100) % 100 !== 0;
  return `Tk ${n.toLocaleString('en-US', { minimumFractionDigits: hasPaisa ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });
}

export function deliveryDays(min: number | null, max: number | null): string {
  if (min && max) return min === max ? `${min} day${min > 1 ? 's' : ''}` : `${min}-${max} days`;
  if (max) return `up to ${max} days`;
  return '';
}

/** Validates a Bangladeshi mobile number the same way the API does (01XXXXXXXXX after cleanup). */
export function normalizeBdPhone(raw: string): string | null {
  let digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}
