# Cartix Storefront (Next.js)

The customer-facing shop: home page, catalog, product pages, cart, guest checkout with cash on
delivery, order confirmation and order tracking. All data comes from the Laravel API (`/api/v1`).

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Vitest, Playwright.

## Run on Ubuntu

The Laravel API must be running first (see `../cartix-backend/README.md`).

```bash
cd cartix-storefront
cp .env.example .env.local      # adjust CARTIX_API_URL if the API is not on 127.0.0.1:8000
npm install
npm run dev                     # http://localhost:3000

# Production build
npm run build
npm start                       # http://localhost:3000
```

Memory note for an 8 GB laptop: in testing, the largest process during `npm run build` peaked at about
660 MB and the build took about 13 seconds. Run one build at a time and close other heavy programs.

## Environment variables

| Variable | Where it is used | Purpose |
|---|---|---|
| `CARTIX_API_URL` | server only | Laravel API base, e.g. `http://127.0.0.1:8000/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | server and browser | Public storefront URL for canonical links, sitemap and Open Graph |
| `CARTIX_IMAGE_ORIGINS` | build | Extra image hosts for `next/image` (comma-separated); the API host is always allowed |
| `CARTIX_SECURE_COOKIES` | server | `true` to mark cookies `Secure` (default: on in production) |

## How it works

- **Pages** are server-rendered on request. Catalog data is cached in the Next.js fetch cache for
  60 seconds (categories and brands 5 minutes), so price and stock changes show up within a minute.
  Cart and order data are never cached.
- **Cart and checkout go through this app's own route handlers** (`src/app/api/*`). They keep the guest
  cart token in an httpOnly, SameSite=Lax cookie (`cartix_cart`) and forward requests to Laravel. The
  token never reaches page JavaScript. Order access tokens are stored the same way (`cartix_order_<number>`),
  so only the device that placed an order can open its full details.
- Route handlers that change data reject requests from other origins.
- The storefront never calculates prices. It shows the server's quote, sends the confirmed total as
  `expected_total`, and the API refuses the order with `409` if the total changed.
- Double submission is prevented twice: the button is disabled while sending, and every attempt carries
  an `Idempotency-Key`, so a retry returns the same order.
- Filters are a plain GET form, so they work without JavaScript and every result page has a shareable URL.
- Images use `next/image`. The demo artwork is SVG and is served without optimization (SVG optimization
  is disabled for security); real product photos (JPG, PNG, WebP) are optimized.
- The hanging rail (`src/components/home/HangingRail.tsx`) shows rail collections. It stops moving for
  visitors who prefer reduced motion and has keyboard and arrow-button controls.

## Pages

| Route | Page |
|---|---|
| `/` | Home: announcement bar, hero banner, categories, featured, hanging rail, new arrivals, best sellers, collections, delivery and payment facts |
| `/products` | All products with filters, sorting and pagination |
| `/category/[slug]`, `/brand/[slug]`, `/collections/[slug]` | Filtered listings |
| `/search?q=` | Search results (not indexed by search engines) |
| `/product/[slug]` | Gallery, variant selection, stock status, quantity, add to cart, reviews, related products, Product JSON-LD |
| `/cart` | Cart with quantity changes, removal, price-change and stock warnings |
| `/checkout` | Contact and address (division, district, upazila or area), payment method, coupon, review step with explicit confirmation |
| `/order/[number]` | Confirmation and order details (only on the device that placed the order) |
| `/track-order` | Order lookup with order number and phone (masked details) |
| `/sitemap.xml`, `/robots.txt` | SEO |

## Tests

```bash
npm run typecheck
npm run lint
npm test                 # Vitest unit and component tests

# Full browser journey (needs the API, this app and the database running):
npx playwright install chromium   # once
E2E_DB_PASSWORD=your-db-password npm run test:e2e
```

The end-to-end journey searches for a product, adds two units, checks out with cash on delivery,
confirms the order, then checks the database (order row, item snapshot, stock reservation, a single
order despite a double click, empty cart) and the order lookup. It also checks that no Bengali
characters appear on any visited page. It places a real order in the database it runs against, so use
a local or test database. Screenshots are saved in `e2e/artifacts/`.
