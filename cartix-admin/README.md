# Cartix Admin (React + Vite + TypeScript)

The Cartix admin dashboard. It uses the Laravel backend's `/api/admin` endpoints.

## Pages

The sidebar is grouped and collapsible, and shows only the pages the signed-in role may use.
On phones it folds into a "Menu" button.

| Group | Page | What it does | Permission |
|---|---|---|---|
| Overview | Dashboard | Orders and sales today, gross profit today (separate from sales), pending orders, low stock count, 30-day return rate, 7-day chart, fulfillment pipeline, recent orders, quick actions | dashboard.view |
| Sales & Fulfillment | Orders | Filter by status, search by order number, phone or name; order detail with "Confirmed by phone", cancel with a reason (reserved stock is released), packed / shipped / delivered / returned, history | orders.view / orders.manage |
| Catalog Management | Products | Search by name or SKU, filter by status, category and stock level; edit details, URL name, brand, featured flag, SEO text; add and edit variants (price, regular price, cost price, weight, SKU, low-stock alert, on sale); upload several photos at once and link each to a color (picked from the file name when it contains the color), reorder and remove them; hanging-rail artwork under "Advanced"; delete never-ordered products, archive the rest | products.view / products.manage |
| | Categories & Brands | Two-level categories with images and menu order; brands with logos; only empty ones can be deleted | products.manage |
| | Inventory | Every variant with on hand, reserved and available stock; low/out filters; add stock or correct a count with a note; full stock history per variant | products.view / inventory.manage |
| | Attributes | Sizes and colors used for variants; values in use cannot be deleted | products.manage |
| Customers & Marketing | Customers | Customers grouped by phone number from their orders, with order count, total spent and last address | customers.view |
| | Coupons & Promotions | Percentage, fixed amount or free delivery; minimum order, maximum discount, total and per-phone limits, start and end (Dhaka time); used coupons are kept | coupons.manage |
| Business & Analytics | Reports & Analytics | Gross sales, product sales, cost of goods, gross profit and delivered profit for any period, day by day, best sellers | reports.view |
| System Management | Staff & Permissions | Add staff with a role, block them, change roles, set passwords; changes sign them out at once | staff.manage (super admin only) |
| | Shipping & Locations | Delivery charge per zone and which districts are open for delivery (for example Dhaka only) | settings.manage |
| | Activity Logs | Who changed what and when, with the IP address | activity.view |

Not in the sidebar yet, because they are not built: Shipments (courier integration), Payments (online
payment), Returns & Refunds, Reviews moderation and Settings.

## Run

Run these in the `cartix-admin` folder. The API must be running at `http://127.0.0.1:8000`.

```bash
npm install
npm run dev        # http://localhost:5173, /api requests are proxied to http://127.0.0.1:8000
npm run lint
npm run build      # production files in dist/
```

If the API runs elsewhere, create `.env.local`:

```
VITE_API_PROXY=http://127.0.0.1:8000                # development proxy target
VITE_API_BASE=https://api.cartixbd.com/api/admin    # used by the production build
```

Add the dashboard's origin to `CORS_ALLOWED_ORIGINS` in the backend `.env`.

## Browser regression test

`e2e/admin-journey.mjs` (42 checks) logs in (wrong password first), checks the dashboard figures and
sidebar groups, confirms and ships a pending order, filters products, edits a product and uploads a photo, uploads three photos at once with colors taken from the file names and checks that the shop switches photos when a color is picked,
adds stock and checks the stock history, creates a product, a category and a coupon, opens a customer,
the sales report, shipping coverage (toggles a district and restores it), staff and the activity log,
checks the phone layout and menu, checks that no Bengali text appears, and logs out. It changes data in
the database it runs against, so use a local or test database.

```bash
npx playwright install chromium      # once, downloads the browser
ADMIN_PASSWORD=your-admin-password npm run test:e2e
```

The login endpoint allows 5 attempts per minute, so wait a minute between repeated runs.

## Notes

The login token is kept in the browser's localStorage and expires after 7 days. The admin panel loads
no third-party scripts, which keeps that risk low; hosting the dashboard and API on the same parent
domain and switching to Sanctum cookie sessions would be safer still.

Roles: `super_admin`, `admin`, `order_manager` (handles orders, cannot create products), `vendor_owner`, `vendor_staff`, `customer`.
