# Cartix Backend (Laravel 12 API)

The Cartix marketplace backend: database, catalog, guest cart and checkout, orders, stock, money
calculations, the admin API and the customer storefront API.

- Admin API: `/api/admin/*` (Sanctum bearer tokens, role permissions)
- Customer storefront API: `/api/v1/*` (public catalog, guest cart and guest checkout). Full reference: [docs/API.md](docs/API.md)

## Verified status

| Item | Result |
|---|---|
| Laravel / PHP / MySQL | Laravel 12.70.1. This release was tested with PHP 8.3 and MySQL 8.0 in the build environment; Phase 1 (45 tests) was also confirmed on Ubuntu 26.04 with PHP 8.5.4 and MySQL 8.4 |
| Tests | 88 PHPUnit tests, 7,277 assertions, all passing on a real MySQL database |
| Code style | `vendor/bin/pint --test` passes |
| Concurrency | 10 parallel checkouts for 3 units in stock: 3 orders, 7 refused, no oversell (see `scripts/concurrency_check.py`) |

## Requirements

PHP 8.2+ with the `mbstring`, `xml`, `curl`, `mysql`, `intl` and `zip` extensions, Composer 2, MySQL 8.

## Setup on Ubuntu

Run these commands in the `cartix-backend` folder.

```bash
# 1. Install PHP packages
composer install

# 2. Create .env and the application key
cp .env.example .env
php artisan key:generate

# 3. Create the databases and a user (once). Choose your own password.
sudo mysql -e "CREATE DATABASE cartix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE cartix_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cartix'@'127.0.0.1' IDENTIFIED BY 'your-password';
GRANT ALL ON cartix.* TO 'cartix'@'127.0.0.1';
GRANT ALL ON cartix_test.* TO 'cartix'@'127.0.0.1';"
# Then set DB_PASSWORD=your-password in .env and the same password in phpunit.xml (DB_PASSWORD).

# 4. Create the tables and the starting data.
#    With APP_ENV=local, demo products, a demo banner, collections and demo orders are added too.
php artisan migrate --seed
#    Admin login: phone 01700000000, password = CARTIX_ADMIN_PASSWORD from .env.
#    If that is empty, the seeder generates a password and prints it once.

# 5. Make uploaded and demo images reachable at /storage
php artisan storage:link

# 6. Start the API
php artisan serve            # http://127.0.0.1:8000

# 7. Run the tests (uses the cartix_test database and resets it)
composer test                # or: vendor/bin/phpunit
vendor/bin/pint --test       # code style check
```

Production also needs the scheduler, which releases expired stock reservations:
`* * * * * cd /path/to/cartix-backend && php artisan schedule:run >> /dev/null 2>&1`

## Environment variables (Cartix-specific)

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://127.0.0.1:8000` | Base URL used for image links in API responses |
| `CORS_ALLOWED_ORIGINS` | admin and storefront localhost origins | Browser origins allowed to call the API |
| `TRUSTED_PROXIES` | empty | Proxies whose `X-Forwarded-For` is trusted (set to the storefront server / Nginx address, e.g. `127.0.0.1`) |
| `CARTIX_ADMIN_PHONE` / `CARTIX_ADMIN_PASSWORD` | `01700000000` / empty | First admin account created by the seeder |
| `CARTIX_PAYMENT_METHODS` | `cod` | Payment methods offered at checkout. Only cash on delivery is implemented |
| `CARTIX_CART_LIFETIME_DAYS` | `30` | Days a guest cart is kept after its last change |
| `CARTIX_RATE_LIMIT_STOREFRONT` / `_CHECKOUT` / `_ORDER_LOOKUP` | `240` / `10` / `10` | Requests per minute per client IP |

Never commit `.env`. No secrets are hard-coded in the source.

## Where things are

| Path | Purpose |
|---|---|
| `database/migrations/` | All tables. `2026_10_24_000100_add_storefront_support_columns.php` adds the storefront columns |
| `app/Services/Pricing/OrderPricingService.php` | All money calculations (discounts, commission, vendor earnings) in poisha integers |
| `app/Services/Checkout/CheckoutService.php` | Quote and order placement: sub-orders, snapshots, stock reservation and coupon usage in one transaction, idempotent by checkout key |
| `app/Services/Cart/CartService.php` | Guest carts: hashed tokens, stock and price-change checks, server-side quote |
| `app/Services/Catalog/CatalogQuery.php` | Which products are visible, filters and sorting |
| `app/Services/InventoryService.php` | Reserve, convert and release stock, with a movement history |
| `app/Services/OrderStatusService.php` | Status rules and their effects (stock, ledger, sold count) |
| `app/Http/Controllers/Api/V1/*` | Customer storefront API |
| `app/Http/Controllers/Admin/*` | Admin API |
| `app/Http/Resources/Storefront/*` | Public JSON shapes (no internal fields) |
| `tests/Feature/Storefront*Test.php` | Storefront API tests |
| `tests/Feature/AdminCatalogTest.php`, `AdminOperationsTest.php` | Admin catalog, inventory, reports, customers, coupons, shipping, staff and activity tests |
| `app/Services/Admin/SalesReport.php` | Sales and profit figures (exact DECIMAL sums) for the dashboard and reports |
| `scripts/concurrency_check.py` | Parallel checkout check against a running server |

## Admin API

All routes are under `/api/admin` and need `Authorization: Bearer <token>`, except login. Every request
also checks that the account is active and still has an admin role (`EnsureActiveStaff`): a blocked staff
member gets `401` on their next request. Changes are recorded in `activity_logs` with the IP address.

| Area | Endpoints | Permission |
|---|---|---|
| Sign-in | POST `/login` (5 attempts per minute), GET `/me`, POST `/logout` | none / signed in |
| Dashboard | GET `/dashboard`, `/meta` | dashboard.view |
| Orders | GET `/orders` (status, q), `/orders/{id}`; POST `/orders/{id}/confirm`, `/orders/{id}/cancel`, `/vendor-orders/{id}/status` | orders.view / orders.manage |
| Customers | GET `/customers` (q, sort), `/customers/{phone}` | customers.view |
| Products | GET `/products` (q, status, category_id, stock), `/products/{id}`; POST `/products`; PUT `/products/{id}`; PATCH `/products/{id}/status`; DELETE `/products/{id}` | products.view / products.manage |
| Variants and photos | POST `/products/{id}/variants`; PUT `/variants/{id}`; POST `/products/{id}/images`; PUT `/products/{id}/images/order`, `/images/{id}`; DELETE `/images/{id}` | products.manage |
| Inventory | GET `/inventory` (q, stock), `/inventory/low-stock`, `/variants/{id}/movements`; POST `/variants/{id}/stock` | products.view / inventory.manage |
| Categories, brands, attributes | GET/POST `/categories`, POST/DELETE `/categories/{id}`; GET/POST `/brands`, POST/DELETE `/brands/{id}`; GET `/attributes`, POST `/attributes/{id}/values`, PUT/DELETE `/attribute-values/{id}` | products.manage |
| Coupons | GET/POST `/coupons`, PUT/DELETE `/coupons/{id}` | coupons.manage |
| Reports | GET `/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` | reports.view |
| Shipping | GET `/shipping`; PUT `/shipping/rates/{zone}`, `/shipping/districts/{id}`; POST `/shipping/districts/bulk` | settings.manage |
| Staff | GET/POST `/staff`; PUT `/staff/{id}`, `/staff/{id}/password` | staff.manage |
| Activity | GET `/activity` (action, user_id) | activity.view |

Category and brand updates use POST because browsers can only upload files with POST.

Roles: `super_admin` (everything, including staff), `admin` (everything except staff), `order_manager`
(dashboard, orders, customers, view products), plus `vendor_owner`, `vendor_staff` and `customer`, which
cannot enter the admin panel.

## Security notes

- Passwords are bcrypt hashes; OTP codes are stored hashed; vendor NID and account numbers are encrypted.
- Login gives the same message for a wrong phone and a wrong password, limited to 5 attempts per minute.
- Prices, discounts and delivery charges are always calculated on the server; client prices are ignored.
- Guest cart tokens are random 256-bit values and order access tokens are 256-bit HMAC values (keyed with `APP_KEY`); the database stores only their SHA-256 hashes.
- Order responses never include the IP address, checkout key, token hash, commission or vendor earnings.
- Vendor ledger rows cannot be updated or deleted (an exception is thrown).
- CORS is open only to the origins in `CORS_ALLOWED_ORIGINS`.

## Updating an existing installation

```bash
php artisan migrate                        # adds order_items.unit_cost and districts.is_deliverable
php artisan db:seed --class=RoleSeeder     # adds the new permissions (coupons, reports, staff, ...)
```

Both are safe on existing data. Orders placed before this update have no saved cost price, so they are
reported as "items without cost price" instead of being counted in profit.

## Not implemented yet

- Customer accounts and sign-in (OTP sending needs an SMS provider). Checkout is guest-only; guests reach their order with the token issued at checkout or with order number plus phone.
- Online payments (bKash, Nagad, SSLCommerz) and courier APIs (Steadfast, Pathao).
- The full upazila list (no verified data source yet). Checkout accepts a free-text area when a district has no upazilas.
- Product reviews submission (reviews can be stored and approved, but there is no customer endpoint to write one).
- Vendor registration, KYC and payouts.
