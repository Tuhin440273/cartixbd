# Cartix Admin Dashboard: Audit and Completion Report

Date: 24 October 2026. Scope: audit the admin dashboard (Laravel API, React admin, link to the Next.js
storefront), complete what a single-vendor shop needs to launch in Dhaka, and test everything.

All results below come from commands actually run in the build environment (PHP 8.3.6, MySQL 8.0.46,
Node.js 22, Chromium 141). They have not been run on your Ubuntu laptop yet.

## 1. What the audit found

The audit read the routes, controllers, services, migrations, React pages and tests. It also found
code that already existed but did not work yet:

- **Already working and tested:**
  - admin login with lockout;
  - dashboard: orders today, sales today, orders waiting for confirmation, 30-day return rate, 7-day chart, pipeline, recent orders, low stock list;
  - orders: list, search by order number, phone or name, status filter, detail and history, "Confirmed by phone", cancellation (which releases reserved stock), status steps;
  - products: create with size x color variants, publish or archive, search by name or SKU;
  - stock adjustment.
- **Written but unreachable:** these existed in the backend but had no API routes and no screens:
  - product view, edit and delete;
  - adding and editing variants;
  - photo upload;
  - categories, brands and coupons;
  - the activity logger;
  - a migration that saves the cost price on each order item and lets districts be switched on or off for delivery (not yet applied to the database).
- **Missing:**
  - customers;
  - inventory page and stock history;
  - attributes (sizes and colors);
  - reports with profit;
  - staff management;
  - shipping charges and coverage;
  - activity log page;
  - grouped sidebar;
  - quick actions;
  - pending-orders and low-stock counts on the dashboard.

## 2. Added or fixed

**Backend:**
- Routes for all the existing but unreachable code, with a permission on each route. The existing `RoleSeeder` permissions are used: coupons, reports, staff, settings, customers and activity.
- New screens' APIs:
  - inventory list and stock history per variant;
  - attributes;
  - customers;
  - sales and profit report (`SalesReport` service);
  - staff;
  - shipping rates and district coverage, including bulk changes such as "Dhaka district only";
  - activity log.
- Dashboard now shows:
  - pending orders;
  - low stock count;
  - gross profit today, kept separate from sales.
- **How sales and profit are counted:**
  - **Sales** are order totals, including delivery charges, with cancelled orders left out.
  - **Profit** is product sales after discounts, minus the cost price saved at checkout.
  - Returned and cancelled items are left out of profit, and delivery charges are never counted as profit.
  - Items without a cost price are reported separately rather than guessed.
  - All sums use exact database decimals.
- Activity logging for order confirmation, cancellation, status changes and stock adjustments.

**Admin panel:**
- Sidebar in the requested groups:
  - Overview;
  - Sales & Fulfillment;
  - Catalog Management;
  - Customers & Marketing;
  - Business & Analytics;
  - System Management.
- Sidebar behaviour:
  - groups collapse, and the choice is remembered;
  - the active page is highlighted;
  - only pages the role may use are shown;
  - on phones it becomes a "Menu" button.
- New pages:
  - Product edit (details, variants, photos, delete or archive);
  - Categories & Brands;
  - Inventory;
  - Attributes;
  - Customers and customer detail;
  - Coupons & Promotions;
  - Reports & Analytics;
  - Staff & Permissions;
  - Shipping & Locations;
  - Activity Logs.
- Products list: thumbnails, status, category and stock filters, and paging.
- New product: brand and full description fields; after saving it opens the edit page so you can add photos.
- Dashboard: six figure cards and quick actions.

**Not shown in the sidebar, because they are not built:**
- Shipments (needs a courier integration);
- Payments (needs online payment);
- Returns & Refunds;
- Reviews;
- Settings.

## 3. Security and data-integrity issues found and fixed

1. **Blocked staff stayed signed in.** The account status was checked only at login, so a blocked staff member's token kept working for up to 7 days. Every admin request now re-checks the account.
   - A blocked account gets 401 and its token is deleted.
   - A non-staff account gets 403.
2. **Staff lockout and privilege mistakes are prevented:**
   - nobody can change their own role or block themselves;
   - the last active super admin cannot be demoted or blocked;
   - role changes, blocking and password resets end that person's other sign-ins.
3. **A "purchase" could remove stock.** A negative stock change sent as a purchase was accepted. It is now refused, so the stock history stays truthful.
4. **Low stock counts included items that cannot be sold.** They counted hidden variants and deleted products; they no longer do.
5. **Variants without a stock record were missing** from the inventory list. Such variants are now listed with zero stock.
6. **Usability bug:** after saving a stock change, the inventory list re-sorted and moved the edited row away. The row is now updated in place.
7. **Upload checks:** image uploads accept only JPG, PNG and WebP, up to 4 MB. SVG is refused because it can carry scripts. Error messages are clear and in English.
8. **Delivery coverage:** at least one district must always stay open, and checkout refuses districts that are closed for delivery.

**Data that is kept, not deleted:**
- Products that have orders, categories with products, brands with products, used coupons and attribute values in use cannot be deleted; they are archived or hidden instead.
- Deleted products are soft-deleted, so their stock history stays.

**Rules that were already in place and stay unchanged:**
- money in poisha;
- server-side prices;
- no negative stock;
- no duplicate orders;
- inventory reservations;
- `ip_address` fields.

## 4. Test and build results (final run)

| Check | Result |
|---|---|
| Backend tests (`vendor/bin/phpunit`) | OK, 88 tests, 7,277 assertions (21 new: `AdminCatalogTest` 11, `AdminOperationsTest` 10) |
| Backend style (`vendor/bin/pint --test`) | passed |
| Admin type check, lint, build | passed, 0 warnings |
| Admin browser test (`npm run test:e2e`) | 44 of 44 checks passed (after the multi-photo and image fixes) |
| Storefront browser test (`npm run test:e2e`) | all checks passed after the backend changes |
| Storefront unit tests, type check, lint | 23 tests passed; type check and lint clean |
| Customer to admin, in real browsers | an order placed in the shop (CX-2026-000020) appeared at the top of the admin order list, was confirmed and shipped there, and its cost price (Tk 750) was saved for the profit report |
| Language audit | 0 lines with Bengali characters in all three apps |

**What the new backend tests cover:**
- product filters, editing, unique URL names and SKUs, and publishing rules;
- safe deletion;
- photos, including refused SVG and oversized files;
- categories, brands and attributes;
- inventory history and refused negative stock;
- order-manager restrictions;
- dashboard sales versus profit;
- cost price snapshots;
- the sales report with cancelled, returned and delivered orders;
- customers and coupons;
- delivery coverage and charges reaching checkout;
- staff rules, including a blocked token stopping at once;
- activity log with IP address;
- the full storefront-to-admin workflow, including a cancellation releasing stock.

## 5. Updating your laptop

This is a new package, not the one you already tested. Copy it over your `cartix-v2/cartix` folder, then
in `cartix-backend` run:

```bash
php artisan migrate
php artisan db:seed --class=RoleSeeder
composer test          # expect: OK (88 tests ...)
```

Then in `cartix-admin` run `npm install && npm run dev`. Your data stays.

## 6. Still incomplete

- **Customers:** no customer accounts. Customers are grouped by phone number from their orders.
- **Shipments:** no courier API (Steadfast or Pathao). Tracking codes cannot be entered from the admin yet.
- **Payments:** no online payment. Cash on delivery only.
- **Returns & Refunds:** no return request and refund flow. A shipped order can only be marked "Returned", which puts the stock back.
- **Reviews:** no review moderation page.
- **Settings:** no settings page for the store name, contact phone or social links.
- **Notifications:** no SMS or email to customers or staff.
- **Charts and exports:** the reports have no CSV export, and the charts are simple bars.

## 7. External credentials or integrations still needed

None for the work in this phase. Later you will need:
- an SMS provider (order confirmations, customer sign-in);
- bKash, Nagad or SSLCommerz merchant accounts;
- a Steadfast or Pathao merchant API key.

## 8. Remaining launch blockers

1. **Real products:** real product photos, descriptions and **cost prices**. Profit is only counted for variants that have a cost price.
2. **Hosting:** domain, server, HTTPS and a production `.env`:
   - `APP_DEBUG=false`;
   - strong passwords;
   - `TRUSTED_PROXIES`;
   - real `APP_URL` and CORS origins.
3. **Policy pages on the storefront:** return and exchange policy, privacy policy, terms and contact page. These do not exist yet.
4. **Server jobs:** the scheduler cron (releases expired stock reservations) and daily MySQL backups on the server.
5. **Delivery settings:** set your real delivery charges and coverage in Shipping & Locations. For a Dhaka pilot, use "Dhaka district only".
6. **Staff accounts:** create separate accounts for each staff member, instead of sharing the super admin login.

## 9. Update: several photos at once (24 October)

- Product edit page: select up to 10 photos in one go, set a color and description for each, and upload them together. Each photo is uploaded separately, so one bad file does not stop the others, and failed files stay in the list to retry.
- The color is chosen automatically when the file name contains it (for example `oxford-sky-blue.jpg`). The color of an existing photo can be changed later.
- Photos now belong to a color, not to one size: the shop shows a color's photos for every size of that color, followed by the shared photos.
- Gallery is the only upload type in the main form; hanging-rail artwork moved to an "Advanced" section, so it can no longer be chosen by mistake.

## 10. Fix: uploaded photos did not show in the shop (24 October)

- Cause: the storefront's production server (`npm start`) refuses to optimize images from local addresses such as `127.0.0.1`, a Next.js protection against request forgery. Uploaded JPG and PNG photos go through the optimizer, so they appeared broken; the demo SVG images skip it, which is why only new photos were affected. Verified: the optimizer returned 400 before the fix and 200 after.
- Fix (`next.config.ts`): local addresses are allowed only when `CARTIX_API_URL` itself points to `localhost` or `127.0.0.1` (a laptop or test setup), or when `CARTIX_ALLOW_LOCAL_IMAGES=true`. A live site with a public API domain keeps the protection.
- Tests now fail on any image that does not load: the storefront journey checks every image response, and the admin journey checks that an uploaded photo really displays in the shop (admin: 44 of 44 checks passed; storefront: all checks passed).
