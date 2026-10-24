export interface ImageRef {
  url: string;
  alt: string;
}

export interface ProductCard {
  id: number;
  slug: string;
  name: string;
  category: { name: string; slug: string } | null;
  brand: { name: string; slug: string } | null;
  price: string;
  max_price: string;
  compare_at_price: string | null;
  discount_percent: number | null;
  in_stock: boolean;
  low_stock: boolean;
  image: ImageRef | null;
  hover_image: ImageRef | null;
  rail: { side: string | null; front: string; back: string | null } | null;
  colors: { name: string; hex: string | null }[];
  is_featured: boolean;
}

export interface OptionGroup {
  code: string;
  name: string;
  type: string;
  values: { id: number; value: string; hex: string | null }[];
}

export interface Variant {
  id: number;
  sku: string;
  label: string;
  price: string;
  compare_at_price: string | null;
  option_value_ids: number[];
  in_stock: boolean;
  max_quantity: number;
  low_stock: boolean;
  is_default: boolean;
}

export interface ProductDetail extends ProductCard {
  short_description: string | null;
  description: string | null;
  breadcrumbs: { name: string; slug: string }[];
  gallery: (ImageRef & { variant_id: number | null })[];
  options: OptionGroup[];
  variants: Variant[];
  rating: { average: number; count: number };
  meta: { title: string; description: string };
}

export interface Review {
  id: number;
  rating: number;
  comment: string | null;
  author: string;
  vendor_reply: string | null;
  created_at: string | null;
}

export interface Banner {
  id: number;
  title: string;
  image_desktop: string | null;
  image_mobile: string | null;
  link_url: string | null;
}

export interface DeliveryZone {
  zone: string;
  label: string;
  fee: string;
  min_days: number | null;
  max_days: number | null;
}

export interface HomeData {
  banners: Banner[];
  categories: { name: string; slug: string; product_count: number; image: ImageRef | null }[];
  featured: ProductCard[];
  new_arrivals: ProductCard[];
  best_sellers: ProductCard[];
  collections: { name: string; slug: string; type: string; products: ProductCard[] }[];
  store: {
    delivery_from: string | null;
    delivery_zones: DeliveryZone[];
    payment_methods: { code: string; label: string }[];
  };
}

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  product_count: number;
  children: { id: number; name: string; slug: string; product_count: number }[];
}

export interface ListingFilters {
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  brands: { name: string; slug: string }[];
  price: { min: string | null; max: string | null };
}

export interface ProductListing {
  data: ProductCard[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
  filters: ListingFilters;
  sorts: { value: string; label: string }[];
}

export interface CartLine {
  id: number;
  variant_id: number;
  product: { name: string; slug: string } | null;
  variant_label: string | null;
  image: ImageRef | null;
  quantity: number;
  unit_price: string | null;
  previous_unit_price: string | null;
  line_total: string | null;
  max_quantity: number;
  issue: 'unavailable' | 'out_of_stock' | 'insufficient_stock' | null;
  issue_message: string | null;
}

export interface Quote {
  subtotal: string;
  discount: string;
  shipping: string;
  shipping_discount: string;
  total: string;
}

export interface Cart {
  item_count: number;
  items: CartLine[];
  subtotal: string;
  has_issues: boolean;
  can_checkout: boolean;
  quote: Quote | null;
  coupon: { code: string; applied: boolean; message: string } | null;
}

export interface Division {
  id: number;
  name: string;
  districts: { id: number; name: string; shipping_zone: string }[];
}

export interface Order {
  order_number: string;
  placed_at: string | null;
  status: { code: string; label: string };
  payment: { method: string; method_label: string; status: string; status_label: string };
  totals: Quote;
  customer: { name: string | null; phone: string | null; email: string | null };
  shipping_address: {
    recipient_name: string | null;
    phone: string | null;
    division: string | null;
    district: string | null;
    area: string | null;
    address_line: string | null;
    postcode: string | null;
  };
  note: string | null;
  shipments: {
    number: string;
    status: { code: string; label: string };
    tracking: { courier: string; tracking_code: string }[];
    item_ids: number[];
  }[];
  items: {
    id: number;
    product_name: string;
    variant_label: string | null;
    sku: string;
    image: string | null;
    unit_price: string;
    quantity: number;
    discount: string;
    line_total: string;
  }[];
}
