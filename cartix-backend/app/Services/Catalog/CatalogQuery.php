<?php

namespace App\Services\Catalog;

use App\Enums\ProductStatus;
use App\Enums\VendorStatus;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;

/**
 * The single definition of a publicly visible product, plus the catalog filters.
 * Every storefront endpoint starts from visibleProducts(), so hidden, draft or
 * unapproved-vendor products can never leak through one endpoint but not another.
 */
final class CatalogQuery
{
    public const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'best_selling'];

    /** @return Builder<Product> */
    public static function visibleProducts(): Builder
    {
        return Product::query()
            ->where('products.status', ProductStatus::Active)
            ->where(fn (Builder $q) => $q->whereNull('products.published_at')->orWhere('products.published_at', '<=', now()))
            ->whereHas('vendor', fn (Builder $v) => $v->where('status', VendorStatus::Approved))
            ->whereHas('variants', fn (Builder $v) => $v->where('is_active', true));
    }

    /**
     * Relations needed to render a product card without N+1 queries.
     *
     * @return array<int|string, mixed>
     */
    public static function cardRelations(): array
    {
        return [
            'category:id,parent_id,name,slug',
            'brand:id,name,slug',
            'images' => fn ($q) => $q->orderBy('sort_order')->orderBy('id'),
            'variants' => fn ($q) => $q->where('is_active', true)->orderBy('id'),
            'variants.inventory',
            'variants.attributeValues.attribute',
        ];
    }

    /** Category ids for a slug, including its direct children (the tree is two levels deep). */
    public static function categoryIds(string $slug): ?array
    {
        $category = Category::query()->where('slug', $slug)->where('is_active', true)->first();
        if ($category === null) {
            return null;
        }

        return Category::query()->where('is_active', true)
            ->where(fn ($q) => $q->whereKey($category->id)->orWhere('parent_id', $category->id))
            ->pluck('id')->all();
    }

    /**
     * Apply validated listing filters.
     *
     * @param  Builder<Product>  $query
     * @param  array<string, mixed>  $f
     * @return Builder<Product>
     */
    public static function applyFilters(Builder $query, array $f): Builder
    {
        if (! empty($f['category_ids'])) {
            $query->whereIn('products.category_id', $f['category_ids']);
        }
        if (! empty($f['brand'])) {
            $query->whereHas('brand', fn ($b) => $b->where('slug', $f['brand']));
        }
        if (! empty($f['q'])) {
            $like = '%'.addcslashes(trim((string) $f['q']), '%_\\').'%';
            $query->where(fn ($w) => $w->where('products.name', 'like', $like)
                ->orWhere('products.short_description', 'like', $like)
                ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', $like))
                ->orWhereHas('category', fn ($c) => $c->where('name', 'like', $like))
                ->orWhereHas('variants', fn ($v) => $v->where('sku', 'like', $like)));
        }
        if (isset($f['min_price']) && $f['min_price'] !== null) {
            $query->where('products.min_price', '>=', $f['min_price']);
        }
        if (isset($f['max_price']) && $f['max_price'] !== null) {
            $query->where('products.min_price', '<=', $f['max_price']);
        }
        foreach (['size', 'color'] as $code) {
            if (! empty($f[$code])) {
                $values = (array) $f[$code];
                $query->whereHas('variants', fn ($v) => $v->where('is_active', true)
                    ->whereHas('attributeValues', fn ($av) => $av->whereIn('value', $values)
                        ->whereHas('attribute', fn ($a) => $a->where('code', $code))));
            }
        }
        if (! empty($f['in_stock'])) {
            $query->whereHas('variants', fn ($v) => $v->where('is_active', true)
                ->whereHas('inventory', fn ($i) => $i->whereColumn('quantity', '>', 'reserved_quantity')));
        }

        return $query;
    }

    /**
     * @param  Builder<Product>  $query
     * @return Builder<Product>
     */
    public static function applySort(Builder $query, string $sort): Builder
    {
        return match ($sort) {
            'newest' => $query->orderByDesc('products.published_at')->orderByDesc('products.id'),
            'price_asc' => $query->orderBy('products.min_price')->orderByDesc('products.id'),
            'price_desc' => $query->orderByDesc('products.min_price')->orderByDesc('products.id'),
            'best_selling' => $query->orderByDesc('products.sold_count')->orderByDesc('products.id'),
            default => $query->orderByDesc('products.is_featured')->orderByDesc('products.sold_count')->orderByDesc('products.id'),
        };
    }
}
