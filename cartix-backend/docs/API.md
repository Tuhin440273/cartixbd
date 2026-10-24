# Cartix Customer Storefront API (v1)

Base URL: `http://127.0.0.1:8000/api/v1` in local development.

- All requests and responses are JSON. Send `Accept: application/json`.
- Money values are decimal strings in Bangladeshi taka, for example `"1250.00"`. They are for display only:
  the server recalculates every price, discount and delivery charge when an order is placed.
- Errors use one shape: `{"message": "..."}`, plus `"errors": {"field": ["..."]}` for validation errors (HTTP 422).
- Business rule violations (out of stock, invalid coupon, empty cart) return HTTP 422 with a readable `message`.
- Rate limits per client IP (configurable): 240 requests/minute for catalog and cart, 10/minute for
  `POST /checkout`, 10/minute for `POST /orders/lookup`. Exceeding a limit returns HTTP 429.
- Cart and order responses send `Cache-Control: no-store, private`.

## Catalog

### GET /home

Everything the homepage needs: live hero banners, top-level categories that have products, featured,
new arrivals, best sellers (products with sales only), live collections (rail collections contain only
products with rail artwork) and store facts from settings (delivery zones and fees, payment methods).
Empty sections are returned as empty arrays.

### GET /categories

Two-level category tree with the number of visible products in each.

### GET /categories/{slug}

One category with its parent and children. `404` if missing or inactive.

### GET /brands

Active brands that have visible products.

### GET /products

Product listing with search, filters, sorting and pagination.

| Parameter | Type | Notes |
|---|---|---|
| `q` | string, max 100 | Searches name, short description, brand, category and SKU |
| `category` | slug | Includes child categories. Unknown slug returns `404` |
| `brand` | slug | |
| `collection` | slug | |
| `min_price`, `max_price` | number | `max_price` must be at least `min_price` |
| `size[]`, `color[]` | strings | Attribute values, e.g. `size[]=M&size[]=L` |
| `in_stock` | boolean | Only products with available stock |
| `sort` | `featured` (default), `newest`, `price_asc`, `price_desc`, `best_selling` | |
| `page`, `per_page` | integers | `per_page` 1 to 48, default 24 |

Response:

```json
{
  "data": [{
    "id": 2, "slug": "fleece-hoodie", "name": "Fleece Hoodie",
    "category": {"name": "Hoodies", "slug": "hoodies"},
    "brand": {"name": "Cartix Basics", "slug": "cartix-basics"},
    "price": "1250.00", "max_price": "1250.00", "compare_at_price": "1550.00", "discount_percent": 19,
    "in_stock": true, "low_stock": false,
    "image": {"url": "http://127.0.0.1:8000/storage/demo/products/fleece-hoodie-black-front.svg", "alt": "Fleece Hoodie in Black, front view"},
    "hover_image": {"url": "...", "alt": "..."},
    "rail": {"side": "...", "front": "...", "back": "..."},
    "colors": [{"name": "Black", "hex": "#1E2228"}],
    "is_featured": true
  }],
  "meta": {"current_page": 1, "last_page": 1, "per_page": 24, "total": 6},
  "filters": {"sizes": ["S", "M"], "colors": [{"name": "Black", "hex": "#1E2228"}], "brands": [{"name": "Cartix Basics", "slug": "cartix-basics"}], "price": {"min": "450.00", "max": "2190.00"}},
  "sorts": [{"value": "featured", "label": "Featured"}]
}
```

Visible products are: status `active`, published (no publish date or a past one), from an approved vendor,
with at least one active variant.

### GET /products/{slug}

Product detail: everything in the listing card plus `short_description`, `description`, `breadcrumbs`,
`gallery` (with `variant_id` for variant-specific images), `options` (option groups with value ids),
`variants` (id, sku, label, price, compare_at_price, option_value_ids, in_stock, max_quantity, low_stock,
is_default), `rating` and `meta`. Also returns `reviews` (approved only; the author is shown by first name)
and `related` (same category first, then sibling categories). `404` if the product is not visible.

`max_quantity` is the most that can be added for that variant: available stock, capped at 20.

### Locations and shipping

| Endpoint | Returns |
|---|---|
| `GET /locations/divisions` | Divisions with their districts and each district's delivery zone |
| `GET /locations/districts/{id}/upazilas` | Upazilas of a district (may be empty; see checkout `area_name`) |
| `GET /shipping/rates` | Active delivery zones with base fee, per-kg fee and delivery days |

## Guest cart

The cart is identified by the `X-Cart-Token` header. The first `POST /cart/items` without a token creates
a cart and returns its token once as `cart_token`. The token is a random 64-character hex string; the
database stores only its SHA-256 hash. Carts expire after `CARTIX_CART_LIFETIME_DAYS` without changes.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/cart?district_id=&coupon_code=` | | Without a token, returns an empty cart. With `district_id`, includes a server `quote`; with `coupon_code`, also reports whether the coupon applies |
| POST | `/cart/items` | `{"variant_id": 1, "quantity": 2}` | Adds to the existing line. `201` |
| PATCH | `/cart/items/{id}` | `{"quantity": 3}` | Only items in the caller's cart; other ids return `404` |
| DELETE | `/cart/items/{id}` | | |
| DELETE | `/cart` | | Empties the cart |

Quantity per line: 1 to 20, and never more than the available stock. Every cart response:

```json
{
  "data": {
    "item_count": 3,
    "items": [{
      "id": 1, "variant_id": 47, "product": {"name": "Printed Kurti", "slug": "printed-kurti"},
      "variant_label": "M / Mustard", "image": {"url": "...", "alt": "..."},
      "quantity": 2, "unit_price": "990.00", "previous_unit_price": null, "line_total": "1980.00",
      "max_quantity": 13, "issue": null, "issue_message": null
    }],
    "subtotal": "2970.00",
    "has_issues": false,
    "can_checkout": true,
    "quote": {"subtotal": "2970.00", "discount": "0.00", "shipping": "70.00", "shipping_discount": "0.00", "total": "3040.00"},
    "coupon": null
  },
  "cart_token": "only present when the cart was just created"
}
```

`issue` is `unavailable`, `out_of_stock` or `insufficient_stock` when a line blocks checkout.
`previous_unit_price` is set when the price changed after the item was added.

## Checkout

### GET /checkout/options

Payment methods enabled in `CARTIX_PAYMENT_METHODS` (only `cod` by default) and the per-line quantity limit.

### POST /checkout

Headers: `X-Cart-Token` (required) and `Idempotency-Key` (required, 16 to 64 characters of letters,
digits, `-` or `_`). Use one key per order attempt and reuse it when retrying the same attempt.

```json
{
  "customer_name": "Rakib Hasan",
  "customer_phone": "01712345678",
  "customer_email": null,
  "recipient_name": null,
  "recipient_phone": null,
  "district_id": 1,
  "upazila_id": null,
  "area_name": "Mirpur",
  "address_line": "House 12, Road 5",
  "postcode": null,
  "note": null,
  "coupon_code": null,
  "payment_method": "cod",
  "accept_terms": true,
  "expected_total": "3040.00"
}
```

- Phone numbers accept `017...`, `+880 17...` and `88017...` forms and are stored as `01XXXXXXXXX`.
- `area_name` is required when `upazila_id` is not given. Recipient fields default to the customer.
- `expected_total` (optional, recommended) is the total the customer confirmed. If the server total is
  different, nothing is created and the response is `409` with `{"code": "total_changed", "total": "..."}`.
- Prices sent by the client are ignored.

What happens, in one database transaction: the cart row is locked; an existing order for the same
cart and key is returned instead of a new one; the cart lines are priced again; stock is locked and
reserved per variant (cash-on-delivery reservations do not expire); the order, vendor sub-orders, item
snapshots, status history and coupon usage are written; the cart is emptied.

Responses:

| Status | Meaning |
|---|---|
| `201` | Order created. Body: `data` (the order, see below), `access_token`, `replayed: false` |
| `200` | Same cart and key as an earlier successful request. The same order and token, `replayed: true` |
| `400` | Missing or invalid `Idempotency-Key` |
| `404` | Cart not found or expired |
| `409` | `total_changed` (see above) |
| `422` | Validation error, empty cart, item unavailable, not enough stock, invalid coupon |
| `429` | Too many checkout attempts |

The `access_token` is shown only in this response. Keep it on the device (the storefront stores it in an
httpOnly cookie) to open the order later.

## Orders

### GET /orders/{order_number}

Header `X-Order-Token: <access_token>`. Returns the full order. A wrong token and a missing order give
the same `404` message, so order numbers cannot be probed.

### POST /orders/lookup

Body `{"order_number": "CX-2026-000012", "phone": "01712345678"}`. The phone must match the customer
or recipient phone. Returns a limited view: names and phones masked (`Rakib ***`, `017*****678`), no
street address, postcode, email or note. Limited to 10 requests per minute per IP.

Order shape:

```json
{
  "order_number": "CX-2026-000012",
  "placed_at": "2026-10-23T03:22:40+00:00",
  "status": {"code": "pending", "label": "New"},
  "payment": {"method": "cod", "method_label": "Cash on delivery", "status": "unpaid", "status_label": "Unpaid"},
  "totals": {"subtotal": "2970.00", "discount": "0.00", "shipping": "70.00", "shipping_discount": "0.00", "total": "3040.00"},
  "customer": {"name": "Rakib Hasan", "phone": "01712345678", "email": null},
  "shipping_address": {"recipient_name": "Rakib Hasan", "phone": "01712345678", "division": "Dhaka", "district": "Dhaka", "area": "Mirpur", "address_line": "House 12, Road 5", "postcode": null},
  "note": null,
  "shipments": [{"number": "CX-2026-000012-A", "status": {"code": "pending", "label": "Awaiting confirmation"}, "tracking": [], "item_ids": [12, 13]}],
  "items": [{"id": 12, "product_name": "Printed Kurti", "variant_label": "M / Mustard", "sku": "PRINTED-KURTI-MUSTARD-M", "image": "...", "unit_price": "990.00", "quantity": 2, "discount": "0.00", "line_total": "1980.00"}]
}
```

## Example session with curl

```bash
API=http://127.0.0.1:8000/api/v1
# Add to a new cart and keep the token
TOKEN=$(curl -s -X POST $API/cart/items -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"variant_id":47,"quantity":1}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["cart_token"])')
# Quote for Dhaka (district id 1 in the seeded data)
curl -s "$API/cart?district_id=1" -H 'Accept: application/json' -H "X-Cart-Token: $TOKEN"
# Place the order
curl -s -X POST $API/checkout -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -H "X-Cart-Token: $TOKEN" -H "Idempotency-Key: $(python3 -c 'import uuid;print(uuid.uuid4())')" \
  -d '{"customer_name":"Rakib Hasan","customer_phone":"01712345678","district_id":1,"area_name":"Mirpur","address_line":"House 12, Road 5","payment_method":"cod","accept_terms":true}'
```

## Not available yet

Customer accounts, saved addresses, order history for signed-in customers, review submission,
online payments and courier tracking updates. See the main README for details.
