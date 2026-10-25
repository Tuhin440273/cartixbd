# Cartix step 2: logo everywhere (task 6)

## Logo files (made from the logo image, background removed)
- cartix-logo.png: full logo (bag above the wordmark), transparent
- cartix-logo-white.png: the same with a white wordmark, for dark backgrounds
- cartix-logo-horizontal.png / cartix-logo-horizontal-white.png: bag beside the wordmark
- cartix-icon.png: bag only, square, transparent
- icon-192.png, icon-512.png, icon-maskable-512.png: home-screen icons
- cartix-logo-email.png: for the email header (task 5)

## Where it appears
- Storefront: header, footer, mobile menu (public/logo), favicon, browser and Apple touch icons,
  home-screen icon (manifest.webmanifest), Open Graph and Twitter share image (1200 x 630).
  Product pages keep sharing the product photo; other pages share the logo image.
- Admin: favicon and Apple touch icon, sidebar (white version), login page (white version in dark mode).
- Backend: favicon, public/logo/cartix-logo-email.png and config('cartix.brand.email_logo_url'),
  which the email templates in task 5 will use. Set APP_URL to the public API address in production.

Logo files live in public/logo, not public/brand, so they cannot clash with the /brand/{slug} pages.
The admin's orange buttons are unchanged (open question).
No database migration is needed.
