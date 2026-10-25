# Cartix step 1: product photo colors (task 1)

## What changed
- Admin > Product > Photos: every color dropdown (saved photos and photos waiting to upload) now lists
  all shop colors in two groups: "This product's colors" and "Other colors (adds them to this product)".
- Choosing another color opens a confirmation: it creates one variant per existing size, copying each
  size's price, regular price, cost price and weight, with stock 0, then links the photo to that color.
- "+ Create a new color…" creates a brand-new shop color (name and swatch) and goes straight to the
  confirmation above. Duplicate names are refused.
- New variants get readable SKUs such as FLEECE-HOODIE-BROWN-M (random suffix only if that SKU is taken).
- API: POST /api/admin/products/{product}/colors {color_value_id} (permission products.manage).
  GET /api/admin/meta now also returns color_attribute_id.

## Files
- cartix-backend/app/Http/Controllers/Admin/ProductController.php
- cartix-backend/app/Http/Controllers/Admin/MetaController.php
- cartix-backend/routes/api.php
- cartix-backend/tests/Feature/AdminCatalogTest.php (2 new tests)
- cartix-admin/src/api.ts
- cartix-admin/src/pages/ProductEdit.tsx
- cartix-admin/src/pages/ProductPhotos.tsx

No database migration is needed.
