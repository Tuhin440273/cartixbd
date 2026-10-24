# Cartix Customer Storefront: Implementation Report

Date: 23 October 2026. Scope: customer storefront APIs (`/api/v1`), the Next.js storefront
(`cartix-storefront`), English-only conversion of the whole project, tests and documentation.

All results below come from commands that were actually run in the build environment
(PHP 8.3.6, MySQL 8.0.46, Node.js 22.22.0, Chromium 141 via Playwright 1.56.0). Nothing here was
run on your Ubuntu laptop yet.

## 1. Summary

| Area | Status |
|---|---|
| Customer catalog API (home, categories, brands, listing with search, filters, sorting, pagination, product detail, reviews, related, locations, shipping rates) | Done, tested |
| Guest cart API (hashed tokens, add, update, remove, clear, price-change and stock warnings, server quote with coupon) | Done, tested |
| Guest checkout (cash on delivery, idempotent, total confirmation, stock reservation, coupon, snapshots, IP address) | Done, tested, including real parallel requests |
| Guest order access (token from checkout) and lookup (order number + phone, masked) | Done, tested |
| Rate limits, CORS, trusted proxies, no-store caching for carts and orders | Done, tested |
| Next.js storefront (all pages in the specification) | Done, built, unit tested, browser tested |
| English-only conversion (backend, admin, storefront, docs, demo data, tests) | Done, audited: 0 Bengali characters |
| Customer accounts, online payment, courier integration, upazila list, review submission | Not done (see section 8) |

## 2. Database changes

One new migration, `2026_10_24_000100_add_storefront_support_columns.php` (tested: migrate, rollback, migrate):

- `name_bn` becomes nullable on `divisions`, `districts`, `upazilas`, `categories` and `attributes`
  (nothing is removed or renamed; no Bengali data is written).
- `cart_items.unit_price_at_add` (decimal, nullable): the price when the item was added, used only to warn
  about price changes. The current variant price is always the price charged.
- `orders.checkout_key` (varchar 64, unique, nullable): idempotency key, SHA-256 of cart id and the
  client's `Idempotency-Key`.
- `orders.access_token_hash` (varchar 64, nullable): SHA-256 of the guest order access token.

No existing data is changed or deleted. Code-level addition: `ProductVariantObserver` keeps the product's
cached `min_price` / `max_price` in step with its variants (listing filters and price sorting rely on it;
before this, only the admin product form updated it).

## 3. Backend: files and endpoints

New files in `cartix-backend`:

- Controllers: `app/Http/Controllers/Api/V1/{HomeController, CatalogController, LocationController, CartController, CheckoutController, OrderController}.php`
- Resources: `app/Http/Resources/Storefront/{ProductCardResource, ProductDetailResource, OrderPresenter}.php`
- Services: `app/Services/Catalog/CatalogQuery.php`, `app/Services/Cart/CartService.php`
- Support: `app/Support/Media.php`, `app/Observers/ProductVariantObserver.php`, `config/cartix.php`
- Tests: `tests/Feature/StorefrontCatalogTest.php` (7 tests), `tests/Feature/StorefrontCheckoutTest.php` (15 tests)
- Tools and docs: `scripts/concurrency_check.py`, `docs/API.md`

Changed: `CheckoutService` (quote without writes, idempotent `place()`, caller-chosen access token),
`CheckoutData`, `routes/api.php`, `bootstrap/app.php`, `AppServiceProvider` (rate limiters, observer,
trusted proxies), `config/cors.php` (storefront origins, explicit header list), `.env.example`, `README.md`.

Endpoints (`/api/v1`, full reference in `cartix-backend/docs/API.md`):

| Method | Path | Rate limit |
|---|---|---|
| GET | `/home`, `/categories`, `/categories/{slug}`, `/brands`, `/products`, `/products/{slug}` | 240/min |
| GET | `/locations/divisions`, `/locations/districts/{id}/upazilas`, `/shipping/rates` | 240/min |
| GET, POST, PATCH, DELETE | `/cart`, `/cart/items`, `/cart/items/{id}` | 240/min |
| GET | `/checkout/options`, `/orders/{number}` (with `X-Order-Token`) | 240/min |
| POST | `/checkout` (with `X-Cart-Token` and `Idempotency-Key`) | 10/min |
| POST | `/orders/lookup` | 10/min |

How the rules in the specification are met:

- **Client prices are never trusted.** The checkout body has no price fields; extra fields are ignored.
  `CheckoutService` prices from the database. A test sends fake prices and gets the real total.
- **No duplicate checkout or inventory logic.** The storefront API calls the existing `CheckoutService`
  and `InventoryService`; the cart quote uses the same `CheckoutService::quote()`.
- **No oversell.** Stock rows are locked during reservation. Verified with 10 truly parallel checkouts for
  3 units: 3 orders, 7 refusals with "Not enough stock for Race Hoodie.", reserved 3 of 3.
- **No duplicate orders.** The cart row is locked, and the same cart and key return the existing order.
  Verified with 6 parallel identical submissions: one `201`, five `200`, one order number.
- **Total confirmation.** `expected_total` different from the server total gives `409 total_changed` and
  creates nothing.
- **Ownership.** Cart items are scoped to the caller's cart; another cart's item id returns 404. Orders need
  the access token, or the order number plus a matching phone (then contact data is masked). Wrong token
  and missing order return the same 404.
- **No sensitive data.** Responses never include IP address, checkout key, token hash, cost price,
  commission or vendor earnings (tested). Reviewers are shown by first name only.
- **`ip_address` preserved.** Orders store the client IP. With `TRUSTED_PROXIES` set to the storefront
  server's address, the real client address forwarded by the storefront is stored (verified:
  `203.0.113.9` stored when forwarded through the storefront).
- **Mass assignment.** Controllers pass validated fields only; tokens and keys are set with `forceFill`.
- **Admin login unchanged.** The admin browser regression passes.

## 4. Storefront: files and features

`cartix-storefront` (Next.js 16.4.2, React 19.2, TypeScript strict, Tailwind CSS 4.1), 73 source files:

- Pages: `/`, `/products`, `/category/[slug]`, `/brand/[slug]`, `/collections/[slug]`, `/search`,
  `/product/[slug]`, `/cart`, `/checkout`, `/order/[number]`, `/track-order`, not-found, error,
  global error, loading, `sitemap.xml`, `robots.txt`.
- Route handlers (server-side proxy): `src/app/api/{cart, cart/items, cart/items/[id], checkout, orders/lookup, locations/districts/[id]/upazilas}`.
- Components: header with category menu, mobile menu, search, cart button; footer; hero banner;
  category cards; product card and grid; hanging rail (ported from the earlier prototype, English labels,
  real rail images from the API, reduced-motion support); trust strip built from store settings; listing
  view with GET-form filters, sort and pagination; product gallery and buy box with variant availability;
  cart view; checkout form with review step; order view; track-order form.

Behaviour worth knowing:

- Every price, delivery charge, discount, collection and banner comes from the API. Empty sections are
  hidden, and empty pages show a clear message. No prices, reviews or claims are invented.
- Checkout: contact details, division, district, upazila (or a typed area when the district has no upazila
  list), address, optional postcode, note, a different recipient, payment method, coupon. "Continue to
  review" shows everything with the server total; "Place order" is disabled until the customer ticks the
  confirmation box and while the request is running. Each attempt has an idempotency key, and a changed
  total sends the customer back to confirm again.
- The cart token and order tokens live in httpOnly, SameSite=Lax cookies; route handlers that change data
  reject other origins (verified: 403 with a foreign `Origin`).
- SEO: per-page titles and descriptions, canonical URLs, Open Graph, Product JSON-LD, sitemap with
  categories and all visible products, robots rules (cart, checkout, order and search are not indexed).
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`;
  the `X-Powered-By` header is removed.
- Accessibility: skip link, one `h1` per page (checked on 9 pages), labelled controls, `aria-live` status
  messages, visible focus, keyboard-usable rail and menus, reduced-motion support. No horizontal scrolling
  at 360 px width on the 9 pages checked.

## 5. Tests actually executed (final run)

| Check | Command | Result |
|---|---|---|
| Backend tests | `vendor/bin/phpunit` | OK, 67 tests, 7,056 assertions (45 existing + 22 new) |
| Backend style | `vendor/bin/pint --test` | passed |
| Concurrency | `python3 scripts/concurrency_check.py 1 2 http://127.0.0.1:8001/api/v1` on the test database | 10 buyers for 3 units: 3 created, 7 refused; 6 identical submissions: 1 order |
| Storefront types | `npm run typecheck` | 0 errors |
| Storefront lint | `npm run lint` | 0 errors, 0 warnings |
| Storefront unit and component tests | `npm test` (Vitest 5) | 6 files, 20 tests passed |
| Storefront build | `npm run build` | succeeded; about 13 s, largest process about 660 MB |
| Storefront browser journey | `npm run test:e2e` | 29 of 29 checks passed (search, add to cart, cart, checkout, review, place order with a double click, confirmation, database checks, order lookup, no Bengali text, no browser errors) |
| Admin lint and build | `npm run lint`, `npm run build` | passed |
| Admin browser regression | `npm run test:e2e` | 12 of 12 checks passed |
| Dependency audit (production) | `npm audit --omit=dev` | storefront: 0 vulnerabilities; admin: 2 moderate (see section 8) |
| Language audit | Unicode scan of every source, doc, config and test file in the three apps | 0 lines with Bengali characters |

Backend test coverage of the new API: hidden products (draft, scheduled, inactive variant, suspended
vendor), every filter and sort, pagination, invalid parameters, product detail with stock limits, only
approved reviews, no private fields, cart token hashing, cart CRUD, quotes with weight-based delivery,
cross-cart access, expired carts, stock limits when adding, price and stock warnings, COD order creation
with reservation and IP, ignored client prices and `409` on changed totals, duplicate submissions,
idempotency-key and validation errors, selling the last unit twice, coupon validation and per-phone limit,
token and phone lookup with masking, rate limits, configured payment methods.

## 6. Commands

See `README.md` (all apps), `cartix-backend/README.md`, `cartix-storefront/README.md` and
`cartix-admin/README.md`. Short version: `php artisan migrate --seed && php artisan storage:link &&
php artisan serve`, then `npm install && npm run dev` in `cartix-storefront` and in `cartix-admin`.

New migration on an existing database: `php artisan migrate` (no reseed needed). To get the English demo
data on an existing local database, reseed with `php artisan migrate:fresh --seed`, which deletes all local
data, so only do it on demo data.

## 7. Credentials and settings you need

- `DB_PASSWORD` (backend `.env` and `phpunit.xml`), `APP_KEY` (`php artisan key:generate`),
  `CARTIX_ADMIN_PASSWORD` (choose a strong one).
- `TRUSTED_PROXIES` in production (the address of the storefront server and Nginx), otherwise all
  storefront traffic counts as one IP for rate limits and orders store the server's address.
- `CORS_ALLOWED_ORIGINS`, `APP_URL`, and in the storefront `CARTIX_API_URL` and `NEXT_PUBLIC_SITE_URL`
  with the real domains.
- Not needed yet, needed later: SMS provider (customer OTP sign-in), bKash / Nagad / SSLCommerz merchant
  credentials, Steadfast or Pathao API keys.

No real secrets are in the source. `phpunit.xml` contains the local test database password
`cartix_local_dev`; change it to match your own local MySQL user.

## 8. Not done, limitations and open issues

1. **Customer accounts.** There is no customer sign-in, so no order history page or cart merge on login.
   The phone OTP tables exist but no SMS provider is connected. Guest checkout covers ordering; guests open
   their order on the same device (cookie) or with order number plus phone.
2. **Online payment** is not integrated. Only cash on delivery is offered (`CARTIX_PAYMENT_METHODS=cod`).
   Do not enable another method until its gateway and server-side payment verification exist.
3. **Upazila list** is empty because no verified source was available. Checkout uses a typed area name.
4. **Reviews** are displayed (approved only), but customers cannot submit them yet.
5. **Courier tracking** shows tracking codes that the admin enters; there is no courier API integration.
6. **Admin dependency advisories:** `react-router-dom` 6.30.6 still has two moderate advisories that are
   fixed only in React Router 7.18 (a major upgrade). The admin uses only internal links and no
   server-side rendering, so the practical risk is low; upgrading to React Router 7 is recommended.
   The storefront's development tooling (`eslint-config-next`) pulls in `braces` 3.0.3 with a
   denial-of-service advisory; it is not part of the production app.
7. **Next.js version:** 16.4.2 is used because every older 16.x release has critical advisories (including
   remote code execution in image optimization for SVG files). It is newer than two weeks, so keep it
   updated with patch releases.
8. **Content Security Policy** is not set yet (Next.js inline scripts need a nonce setup). The other
   security headers are set.
9. **`X-Forwarded-For` trust:** if the storefront server is reachable directly from the internet, a client
   can send its own `X-Forwarded-For`. Put Nginx in front of the storefront and let it overwrite that header.
10. **Order numbers can skip values** (for example after a refused checkout rolls back), because the number
    is built from the database id. Numbers stay unique.
11. **Test data in the local demo database:** the browser tests created test orders (CX-2026-000012 to
    CX-2026-000019, some confirmed, shipped or cancelled by the tests) and products named
    "E2E Winter Hoodie ...". This only affects the build environment's local database; a fresh
    `migrate:fresh --seed` gives clean demo data.
12. **Images:** demo products use generated SVG illustrations. Real product photos still need to be
    uploaded; the storefront optimizes JPG, PNG and WebP automatically.

## 9. Language audit

A scan for characters in the Bengali Unicode block (U+0980 to U+09FF) over all `.php`, `.ts`, `.tsx`,
`.js`, `.mjs`, `.css`, `.md`, `.json`, `.xml`, `.html`, `.env*`, `.yml` and `.txt` files in
`cartix-backend`, `cartix-admin`, `cartix-storefront` and the root documents (excluding `vendor`,
`node_modules` and build output) found 0 lines. The storefront browser test also checks the rendered text
of every page it visits for Bengali characters. Bengali digits typed by customers are still accepted in
phone numbers: the converter uses code points, not Bengali characters in the source.

## 10. Recommended next step

Run the setup on your Ubuntu laptop and repeat the checks in section 5 there. After that, the most
valuable next phase is customer accounts with phone OTP sign-in (order history and cart merge), followed by
bKash payment with server-side verification and a Steadfast or Pathao courier integration.
