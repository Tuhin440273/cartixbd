<?php

namespace App\Observers;

use App\Models\ProductVariant;

/** Keeps the product's cached price range (used for listing filters and sorting) in step with its variants. */
class ProductVariantObserver
{
    public function saved(ProductVariant $variant): void
    {
        if ($variant->wasRecentlyCreated || $variant->wasChanged(['price', 'is_active', 'product_id'])) {
            $variant->product?->refreshPriceRange();
        }
    }

    public function deleted(ProductVariant $variant): void
    {
        $variant->product?->refreshPriceRange();
    }

    public function restored(ProductVariant $variant): void
    {
        $variant->product?->refreshPriceRange();
    }
}
