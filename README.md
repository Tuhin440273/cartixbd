# Cartix

Cartix is an online marketplace for Bangladesh, starting with men's shirts and hoodies and moving on to
women's wear and cosmetics. This repository contains three applications:

| Folder | What it is | Stack |
|---|---|---|
| `cartix-backend/` | API, database, business rules, admin API and customer storefront API | Laravel 12, PHP 8.2+, MySQL 8 |
| `cartix-admin/` | Admin dashboard for orders, products and stock | React 19, Vite, TypeScript |
| `cartix-storefront/` | Customer shop: catalog, cart, guest checkout, order tracking | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |

```
Browser ──> cartix-storefront (Next.js, port 3000) ──> cartix-backend /api/v1 (port 8000) ──> MySQL
Browser ──> cartix-admin (Vite, port 5173) ─────────> cartix-backend /api/admin
```

The storefront talks to the API from its server. Guest cart and order tokens stay in httpOnly cookies
and are never readable by page JavaScript.

## Quick start on Ubuntu

You need PHP 8.2+ (extensions `mbstring`, `xml`, `curl`, `mysql`, `intl`, `zip`), Composer 2,
MySQL 8 and Node.js 20.9+ (22 recommended).

Use three terminals, one per application.

```bash
# Terminal 1: API (see cartix-backend/README.md for the database setup)
cd cartix-backend
composer install
cp .env.example .env && php artisan key:generate
#   edit .env: DB_PASSWORD and CARTIX_ADMIN_PASSWORD
php artisan migrate --seed       # with APP_ENV=local this adds demo products and orders
php artisan storage:link
php artisan serve                # http://127.0.0.1:8000

# Terminal 2: storefront
cd cartix-storefront
cp .env.example .env.local
npm install
npm run dev                      # http://localhost:3000

# Terminal 3: admin dashboard
cd cartix-admin
npm install
npm run dev                      # http://localhost:5173  (phone 01700000000, password from .env)
```

## Tests

```bash
cd cartix-backend && composer test && vendor/bin/pint --test
cd cartix-storefront && npm run typecheck && npm run lint && npm test && npm run build
cd cartix-admin && npm run lint && npm run build

# Browser journeys (all three apps running; they write to the database, so use local data)
cd cartix-storefront && E2E_DB_PASSWORD=... npm run test:e2e
cd cartix-admin && ADMIN_PASSWORD=... npm run test:e2e
```

## Documentation

- `cartix-backend/README.md`: backend setup, environment variables, admin API
- `cartix-backend/docs/API.md`: customer storefront API reference with examples
- `cartix-storefront/README.md`: storefront setup, architecture, pages and tests
- `cartix-admin/README.md`: admin dashboard
- `IMPLEMENTATION_REPORT.md`: what was built in the storefront phase, test results and open items
- `ADMIN_AUDIT_REPORT.md`: admin dashboard audit, what was added, test results and launch blockers

## Language

All interface text, messages, documentation, comments, demo data and tests are in English. Some
database columns from the original design (for example `name_bn`) still exist for compatibility, but they
are optional, nothing writes to them and the interface never displays them.
