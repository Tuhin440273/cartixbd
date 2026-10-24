'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Division, Quote } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import { errorMessage, useCart } from '@/components/cart/CartProvider';
import { SmartImage } from '@/components/ui/SmartImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { mapApiErrors, validateCheckout, type CheckoutFields, type FieldErrors } from './validate';

type Upazila = { id: number; name: string };

const initial: CheckoutFields = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  different_recipient: false,
  recipient_name: '',
  recipient_phone: '',
  division_id: '',
  district_id: '',
  upazila_id: '',
  area_name: '',
  address_line: '',
  postcode: '',
  note: '',
  payment_method: '',
};

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function Field({
  id,
  label,
  error,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="font-normal text-subtle"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function CheckoutForm({ divisions, paymentMethods }: { divisions: Division[]; paymentMethods: { code: string; label: string }[] }) {
  const router = useRouter();
  const { cart, loading, refresh } = useCart();
  const [f, setF] = useState<CheckoutFields>({ ...initial, payment_method: paymentMethods.length === 1 ? paymentMethods[0]!.code : '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [upazilaState, setUpazilaState] = useState<{ districtId: string; list: Upazila[] }>({ districtId: '', list: [] });
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  // The quote is tied to the district and coupon it was calculated for.
  const [loadedQuote, setLoadedQuote] = useState<{ key: string; quote: Quote | null }>({ key: '', quote: null });
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // One idempotency key per confirmed attempt: a double click or a retry after a network error
  // reuses it, so the server returns the same order instead of creating a second one.
  const attemptKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof CheckoutFields>(k: K, v: CheckoutFields[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const division = useMemo(() => divisions.find((d) => String(d.id) === f.division_id) ?? null, [divisions, f.division_id]);

  // Upazila list for the chosen district; when the store has none, the customer types the area.
  const upazilas = upazilaState.districtId === f.district_id ? upazilaState.list : [];
  useEffect(() => {
    if (!f.district_id) return;
    const districtId = f.district_id;
    let cancelled = false;
    fetch(`/api/locations/districts/${districtId}/upazilas`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data?: Upazila[] }) => {
        if (!cancelled) setUpazilaState({ districtId, list: b.data ?? [] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [f.district_id]);

  const quoteKey = f.district_id ? `${f.district_id}|${coupon ?? ''}` : '';
  const quote = quoteKey && loadedQuote.key === quoteKey ? loadedQuote.quote : null;
  const quoting = quoteKey !== '' && loadedQuote.key !== quoteKey;

  const updateQuote = useCallback(
    async (districtId: string, code: string | null) => {
      const c = await refresh({ districtId: Number(districtId), couponCode: code });
      setLoadedQuote({ key: `${districtId}|${code ?? ''}`, quote: c?.quote ?? null });
      return c;
    },
    [refresh],
  );

  useEffect(() => {
    if (!f.district_id) return;
    const districtId = f.district_id;
    let cancelled = false;
    refresh({ districtId: Number(districtId), couponCode: coupon }).then((c) => {
      if (!cancelled) setLoadedQuote({ key: `${districtId}|${coupon ?? ''}`, quote: c?.quote ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [f.district_id, coupon, refresh]);

  const couponState = cart?.coupon ?? null;

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    if (!f.district_id) {
      setErrors((e) => ({ ...e, coupon_code: 'Choose your district first, so we can calculate the total.' }));
      return;
    }
    setErrors((e) => ({ ...e, coupon_code: undefined }));
    setCoupon(code);
  };

  const goToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const v = validateCheckout(f, upazilas.length > 0);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      const first = Object.keys(v)[0];
      formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
      return;
    }
    if (!cart?.can_checkout) {
      setNotice('Please fix the items in your cart before placing the order.');
      return;
    }
    attemptKey.current = newKey();
    setConfirmed(false);
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const placeOrder = async () => {
    if (submitting || !confirmed || !quote) return;
    setSubmitting(true);
    setNotice(null);
    const body = {
      customer_name: f.customer_name.trim(),
      customer_phone: f.customer_phone.trim(),
      customer_email: f.customer_email.trim() || undefined,
      recipient_name: f.different_recipient ? f.recipient_name.trim() : undefined,
      recipient_phone: f.different_recipient ? f.recipient_phone.trim() : undefined,
      district_id: Number(f.district_id),
      upazila_id: f.upazila_id ? Number(f.upazila_id) : undefined,
      area_name: f.upazila_id ? undefined : f.area_name.trim(),
      address_line: f.address_line.trim(),
      postcode: f.postcode.trim() || undefined,
      note: f.note.trim() || undefined,
      coupon_code: couponState?.applied ? couponState.code : undefined,
      payment_method: f.payment_method,
      accept_terms: true,
      expected_total: quote.total,
    };

    let res: Response | null = null;
    try {
      res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': attemptKey.current ?? newKey() },
        body: JSON.stringify(body),
      });
    } catch {
      setSubmitting(false);
      setNotice('We could not reach the store. Please check your connection and press "Place order" again. You will not be charged twice.');
      return;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.ok) {
      const number = (data.data as { order_number: string }).order_number;
      void refresh();
      router.replace(`/order/${encodeURIComponent(number)}?placed=1`);
      return;
    }

    setSubmitting(false);
    if (res.status === 409) {
      await updateQuote(f.district_id, coupon);
      attemptKey.current = newKey();
      setConfirmed(false);
      setNotice(errorMessage(data));
      return;
    }
    if (res.status === 422 && data.errors) {
      setErrors(mapApiErrors(data.errors as Record<string, string[]>));
      setStep('details');
      setNotice('Please check the highlighted fields.');
      return;
    }
    // Stock or availability problems: show the message and the updated cart.
    await updateQuote(f.district_id, coupon);
    attemptKey.current = newKey();
    setNotice(errorMessage(data));
  };

  if (loading && !cart) return <p className="card p-6 text-sm text-muted" role="status">Loading your cart...</p>;
  if (!cart || cart.items.length === 0) {
    return <EmptyState title="Your cart is empty" text="Add some products before checking out." action={{ href: '/products', label: 'Start shopping' }} />;
  }

  const inputProps = (id: keyof CheckoutFields) => ({
    id,
    name: id,
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
  });

  const district = division?.districts.find((d) => String(d.id) === f.district_id);
  const upazila = upazilas.find((u) => String(u.id) === f.upazila_id);
  const payment = paymentMethods.find((m) => m.code === f.payment_method);

  const summary = (
    <aside aria-label="Order summary" className="card h-fit space-y-4 p-5 lg:sticky lg:top-40">
      <h2 className="text-lg font-semibold">Order summary</h2>
      <ul className="divide-y divide-line">
        {cart.items.map((l) => (
          <li key={l.id} className="flex gap-3 py-3">
            <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-page">
              {l.image && <SmartImage src={l.image.url} alt="" fill sizes="56px" className="object-contain p-1" />}
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white">{l.quantity}</span>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{l.product?.name ?? 'Unavailable item'}</p>
              {l.variant_label && <p className="text-xs text-muted">{l.variant_label}</p>}
              {l.issue_message && <p className="text-xs font-medium text-danger">{l.issue_message}</p>}
            </div>
            <p className="text-sm font-semibold">{l.line_total ? formatPrice(l.line_total) : ''}</p>
          </li>
        ))}
      </ul>
      {cart.has_issues && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          Some items need attention. <Link href="/cart" className="font-semibold underline">Review your cart</Link>
        </p>
      )}

      <div>
        <label htmlFor="coupon_code" className="label">Coupon code</label>
        <div className="flex gap-2">
          <input id="coupon_code" className="input uppercase" value={couponInput} maxLength={50} onChange={(e) => setCouponInput(e.target.value)} disabled={step === 'review'} autoComplete="off" />
          <button type="button" className="btn-outline" onClick={applyCoupon} disabled={!couponInput.trim() || step === 'review' || quoting}>Apply</button>
        </div>
        {errors.coupon_code && <p className="mt-1 text-xs font-medium text-danger">{errors.coupon_code}</p>}
        {couponState && coupon && (
          <p className={`mt-1 text-xs font-medium ${couponState.applied ? 'text-success' : 'text-danger'}`} role="status">
            {couponState.message}
            {couponState.applied && step === 'details' && (
              <button type="button" className="ml-2 text-subtle underline" onClick={() => { setCoupon(null); setCouponInput(''); }}>Remove</button>
            )}
          </p>
        )}
      </div>

      <dl className="space-y-2 border-t border-line pt-4 text-sm" aria-live="polite" aria-busy={quoting}>
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatPrice(quote?.subtotal ?? cart.subtotal)}</dd></div>
        {quote && Number(quote.discount) > 0 && (
          <div className="flex justify-between text-success"><dt>Discount</dt><dd>- {formatPrice(quote.discount)}</dd></div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">Delivery</dt>
          <dd>{quote ? formatPrice(quote.shipping) : <span className="text-subtle">Choose a district</span>}</dd>
        </div>
        {quote && Number(quote.shipping_discount) > 0 && (
          <div className="flex justify-between text-success"><dt>Delivery discount</dt><dd>- {formatPrice(quote.shipping_discount)}</dd></div>
        )}
        <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
          <dt>Total</dt>
          <dd>{quote ? formatPrice(quote.total) : '--'}</dd>
        </div>
      </dl>
      <p className="text-xs text-subtle">Prices and delivery charges are confirmed by our server when you place the order.</p>
    </aside>
  );

  if (step === 'review') {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="review-title" className="card space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="review-title" className="text-lg font-semibold">Review your order</h2>
            <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setStep('details')} disabled={submitting}>Edit details</button>
          </div>
          {notice && <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm font-medium text-warning">{notice}</p>}
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Contact</dt>
              <dd className="text-muted">{f.customer_name}<br />{f.customer_phone}{f.customer_email && <><br />{f.customer_email}</>}</dd>
            </div>
            <div>
              <dt className="font-semibold">Deliver to</dt>
              <dd className="text-muted">
                {f.different_recipient ? `${f.recipient_name}, ${f.recipient_phone}` : f.customer_name}
                <br />{f.address_line}
                <br />{[upazila?.name ?? f.area_name, district?.name, division?.name].filter(Boolean).join(', ')}{f.postcode && ` ${f.postcode}`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Payment</dt>
              <dd className="text-muted">{payment?.label}</dd>
            </div>
            {f.note && (
              <div>
                <dt className="font-semibold">Note</dt>
                <dd className="text-muted">{f.note}</dd>
              </div>
            )}
          </dl>
          <div className="rounded-lg bg-primary-soft p-4 text-sm">
            <p className="font-semibold">Amount to pay{f.payment_method === 'cod' ? ' on delivery' : ''}: {quote ? formatPrice(quote.total) : '--'}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={submitting} />
            <span>I confirm that my order and delivery details are correct.</span>
          </label>
          <button type="button" className="btn-primary w-full py-3 text-base" onClick={placeOrder} disabled={!confirmed || submitting || !quote || quoting || !cart.can_checkout}>
            {submitting ? 'Placing your order...' : `Place order${quote ? ` (${formatPrice(quote.total)})` : ''}`}
          </button>
        </section>
        {summary}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <form ref={formRef} onSubmit={goToReview} noValidate className="space-y-6" aria-label="Delivery details">
        {notice && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm font-medium text-danger">{notice}</p>}

        <fieldset className="card space-y-4 p-5 sm:p-6">
          <legend className="sr-only">Contact information</legend>
          <h2 className="text-lg font-semibold" aria-hidden="true">Contact information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="customer_name" label="Full name" error={errors.customer_name}>
              <input {...inputProps('customer_name')} className="input" autoComplete="name" maxLength={100} value={f.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
            </Field>
            <Field id="customer_phone" label="Mobile number" error={errors.customer_phone} hint="We will call this number to confirm your order.">
              <input {...inputProps('customer_phone')} className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" maxLength={20} value={f.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} />
            </Field>
            <Field id="customer_email" label="Email" optional error={errors.customer_email}>
              <input {...inputProps('customer_email')} className="input" type="email" autoComplete="email" maxLength={150} value={f.customer_email} onChange={(e) => set('customer_email', e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="card space-y-4 p-5 sm:p-6">
          <legend className="sr-only">Delivery address</legend>
          <h2 className="text-lg font-semibold" aria-hidden="true">Delivery address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="division_id" label="Division" error={errors.division_id}>
              <select
                {...inputProps('division_id')}
                className="input"
                value={f.division_id}
                onChange={(e) => {
                  setF((p) => ({ ...p, division_id: e.target.value, district_id: '', upazila_id: '' }));
                  setErrors((p) => ({ ...p, division_id: undefined }));
                }}
              >
                <option value="">Choose a division</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field id="district_id" label="District" error={errors.district_id}>
              <select
                {...inputProps('district_id')}
                className="input"
                value={f.district_id}
                disabled={!division}
                onChange={(e) => {
                  setF((p) => ({ ...p, district_id: e.target.value, upazila_id: '' }));
                  setErrors((p) => ({ ...p, district_id: undefined }));
                }}
              >
                <option value="">{division ? 'Choose a district' : 'Choose a division first'}</option>
                {division?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            {upazilas.length > 0 ? (
              <Field id="upazila_id" label="Upazila / thana" error={errors.upazila_id}>
                <select {...inputProps('upazila_id')} className="input" value={f.upazila_id} onChange={(e) => set('upazila_id', e.target.value)}>
                  <option value="">Choose an upazila or thana</option>
                  {upazilas.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field id="area_name" label="Area, upazila or thana" error={errors.area_name}>
                <input {...inputProps('area_name')} className="input" autoComplete="address-level3" maxLength={100} placeholder="e.g. Mirpur" value={f.area_name} onChange={(e) => set('area_name', e.target.value)} />
              </Field>
            )}
            <Field id="postcode" label="Postcode" optional error={errors.postcode}>
              <input {...inputProps('postcode')} className="input" inputMode="numeric" autoComplete="postal-code" maxLength={4} value={f.postcode} onChange={(e) => set('postcode', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="address_line" label="Address" error={errors.address_line} hint="House, road, block or village">
                <input {...inputProps('address_line')} className="input" autoComplete="street-address" maxLength={255} value={f.address_line} onChange={(e) => set('address_line', e.target.value)} />
              </Field>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.different_recipient} onChange={(e) => set('different_recipient', e.target.checked)} />
            Someone else will receive this order
          </label>
          {f.different_recipient && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="recipient_name" label="Recipient's name" error={errors.recipient_name}>
                <input {...inputProps('recipient_name')} className="input" maxLength={100} value={f.recipient_name} onChange={(e) => set('recipient_name', e.target.value)} />
              </Field>
              <Field id="recipient_phone" label="Recipient's mobile number" error={errors.recipient_phone}>
                <input {...inputProps('recipient_phone')} className="input" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" maxLength={20} value={f.recipient_phone} onChange={(e) => set('recipient_phone', e.target.value)} />
              </Field>
            </div>
          )}

          <Field id="note" label="Delivery note" optional error={errors.note}>
            <textarea {...inputProps('note')} className="input min-h-20" maxLength={500} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </fieldset>

        <fieldset className="card space-y-3 p-5 sm:p-6" aria-describedby={errors.payment_method ? 'payment_method-error' : undefined}>
          <legend className="sr-only">Payment method</legend>
          <h2 className="text-lg font-semibold" aria-hidden="true">Payment method</h2>
          {paymentMethods.map((m) => (
            <label key={m.code} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm ${f.payment_method === m.code ? 'border-primary bg-primary-soft' : 'border-line'}`}>
              <input type="radio" name="payment_method" value={m.code} checked={f.payment_method === m.code} onChange={() => set('payment_method', m.code)} className="h-4 w-4 accent-primary" id={paymentMethods.length === 1 ? 'payment_method' : undefined} />
              <span>
                <span className="block font-semibold">{m.label}</span>
                {m.code === 'cod' && <span className="text-muted">Pay in cash when you receive your parcel.</span>}
              </span>
            </label>
          ))}
          {errors.payment_method && <p id="payment_method-error" className="text-xs font-medium text-danger">{errors.payment_method}</p>}
        </fieldset>

        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={!cart.can_checkout}>
          Continue to review
        </button>
      </form>
      {summary}
    </div>
  );
}
