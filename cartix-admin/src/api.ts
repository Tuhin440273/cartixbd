// Client and types for the Laravel admin API

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/admin';
const TOKEN_KEY = 'cartix_admin_token';

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;

  constructor(message: string, status: number, errors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* Private browsing: the token only lives in this tab. */
    }
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}): Promise<T> {
  // FormData (file uploads) is sent as multipart; everything else as JSON.
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const token = tokenStore.get();
  const res = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
  });

  if (res.status === 401) {
    tokenStore.set(null);
    onUnauthorized();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      (res.status === 403 ? 'You do not have permission to do this.' : res.status >= 500 ? 'The server ran into a problem. Please try again shortly.' : 'The request could not be completed.');
    throw new ApiError(message, res.status, data?.errors ?? {});
  }
  return data as T;
}

export const taka = (v: string | number) =>
  'Tk ' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const dhakaDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

export const STATUS_LABEL: Record<string, string> = {
  pending: 'New',
  confirmed: 'Confirmed',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  returned: 'Returned',
};

// ---------- Types ----------
export interface AdminUser {
  id: number;
  name: string;
  phone: string;
  roles: string[];
  permissions: string[];
}

export interface OrderSummary {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  district: string;
  payment_method: string;
  payment_method_label: string;
  payment_status: string;
  grand_total: string;
  status: OrderStatus;
  status_label: string;
  created_at: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
export type VendorOrderStatus = 'pending' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'returned' | 'cancelled';

export interface DashboardData {
  kpis: {
    today_gross_profit: string;
    today_items_without_cost: number;
    pending_orders: number;
    low_stock_count: number;
    today_orders: number;
    yesterday_orders: number;
    today_sales: string;
    waiting_confirmation: number;
    return_rate_30d: number;
    shipped_30d: number;
  };
  orders_per_day: { date: string; orders: number }[];
  pipeline: { status: VendorOrderStatus; label: string; count: number }[];
  recent_orders: OrderSummary[];
  low_stock: { variant_id: number; product: string; variant: string; sku: string; available: number }[];
  generated_at: string;
}

export interface OrderDetail extends OrderSummary {
  customer_email: string | null;
  ship: {
    recipient_name: string;
    phone: string;
    division: string;
    district: string;
    upazila: string | null;
    address_line: string;
    postcode: string | null;
  };
  totals: { subtotal: string; discount_total: string; shipping_total: string; shipping_discount: string; grand_total: string };
  coupon_code: string | null;
  customer_note: string | null;
  vendor_orders: {
    id: number;
    sub_number: string;
    vendor: string;
    status: VendorOrderStatus;
    status_label: string;
    allowed_next: { value: VendorOrderStatus; label: string }[];
    subtotal: string;
    shipping_fee: string;
    commission_amount: string;
    vendor_earning: string;
    items: {
      id: number;
      product_name: string;
      variant_label: string | null;
      sku: string;
      image: string | null;
      unit_price: string;
      quantity: number;
      discount_amount: string;
      line_total: string;
    }[];
  }[];
  history: { from: string | null; to: string; note: string | null; by: string | null; sub_order: number | null; at: string }[];
}

export interface ProductRow {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  sold_count: number;
  category: string | null;
  status: string;
  status_label: string;
  min_price: string;
  max_price: string;
  stock: number;
  variants: { id: number; sku: string; label: string; price: string; is_active: boolean; quantity: number; reserved: number; available: number; low: boolean }[];
}

export interface Paged<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface Meta {
  categories: { id: number; parent_id: number | null; name: string }[];
  brands: { id: number; name: string }[];
  sizes: { id: number; value: string }[];
  colors: { id: number; value: string; color_hex: string | null }[];
  /** Missing on older APIs; without it the admin cannot create colors from the photo picker. */
  color_attribute_id?: number | null;
  order_statuses: Record<string, string>;
  vendor_order_statuses: Record<string, string>;
  product_statuses: Record<string, string>;
}

export interface ProductDetail {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  brand_id: number | null;
  short_description: string | null;
  description: string | null;
  status: string;
  status_label: string;
  is_featured: boolean;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  sold_count: number;
  has_orders: boolean;
  variants: {
    id: number;
    sku: string;
    label: string;
    size_value_id: number | null;
    color_value_id: number | null;
    price: string;
    compare_at_price: string | null;
    cost_price: string | null;
    weight_grams: number | null;
    is_default: boolean;
    is_active: boolean;
    quantity: number;
    reserved: number;
    available: number;
    low_stock_threshold: number;
  }[];
  images: { id: number; url: string; kind: string; variant_id: number | null; alt: string | null; sort_order: number }[];
}

export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  image: string | null;
  commission_rate: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  children?: Category[];
}

export interface Brand { id: number; name: string; slug: string; logo: string | null; is_active: boolean; product_count: number }

export interface InventoryRow {
  variant_id: number;
  product_id: number;
  product: string;
  product_status: string;
  variant: string;
  sku: string;
  is_active: boolean;
  quantity: number;
  reserved: number;
  available: number;
  threshold: number;
  state: 'in' | 'low' | 'out';
}

export interface StockMovement {
  id: number;
  change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reason_label: string;
  note: string | null;
  by: string | null;
  at: string | null;
}

export interface AttributeGroup {
  id: number;
  code: string;
  name: string;
  type: string;
  values: { id: number; value: string; color_hex: string | null; sort_order: number; variant_count: number }[];
}

export interface CustomerRow {
  phone: string;
  name: string | null;
  district: string | null;
  orders_count: number;
  cancelled_count: number;
  total_spent: string;
  first_order_at: string | null;
  last_order_at: string | null;
}

export interface CustomerDetail {
  phone: string;
  name: string;
  email: string | null;
  last_address: { recipient_name: string | null; phone: string | null; address_line: string | null; area: string | null; district: string | null; division: string | null };
  orders_count: number;
  cancelled_count: number;
  total_spent: string;
  orders: OrderSummary[];
}

export interface Coupon {
  id: number;
  code: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  type_label: string;
  value: string;
  min_order_amount: string;
  max_discount: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  times_used: number;
  discount_given: string;
  state: 'live' | 'inactive' | 'expired' | 'scheduled' | 'used_up';
}

export interface SalesReport {
  period: { from: string; to: string };
  summary: {
    orders: number;
    cancelled_orders: number;
    gross_sales: string;
    discounts: string;
    delivery_charges: string;
    units_sold: number;
    product_sales: string;
    cost_of_goods: string;
    gross_profit: string;
    delivered_profit: string;
    items_without_cost: number;
    sales_without_cost: string;
  };
  daily: { date: string; orders: number; gross_sales: string; gross_profit: string }[];
  top_products: { product_id: number; name: string; units: number; sales: string }[];
}

export interface StaffMember {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: string | null;
  status: 'active' | 'blocked';
  last_login_at: string | null;
  created_at: string | null;
}

export interface ShippingData {
  rates: {
    zone: string;
    label: string;
    id: number | null;
    base_fee: string | null;
    per_kg_fee: string | null;
    min_days: number | null;
    max_days: number | null;
    is_active: boolean;
    districts: number;
    deliverable_districts: number;
  }[];
  divisions: { id: number; name: string; districts: { id: number; name: string; shipping_zone: string; is_deliverable: boolean }[] }[];
  zones: Record<string, string>;
}

export interface ActivityRow {
  id: number;
  action: string;
  user: string | null;
  subject_type: string | null;
  subject_id: number | null;
  properties: Record<string, unknown> | null;
  ip_address: string | null;
  at: string | null;
}

/** Turns an ApiError into a field-to-message map for forms. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError)) return {};
  return Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0] ?? '']));
}
