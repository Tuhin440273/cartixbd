<?php

namespace App\Http\Resources\Storefront;

use App\Enums\ProductImageKind;
use App\Models\AttributeValue;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Services\Checkout\CheckoutService;
use App\Support\Media;
use Illuminate\Http\Request;

/**
 * Full public product page data: gallery, option groups and per-variant price and availability.
 *
 * @mixin Product
 */
class ProductDetailResource extends ProductCardResource
{
    public function toArray(Request $request): array
    {
        /** @var Product $p */
        $p = $this->resource;
        $variants = $p->variants->where('is_active', true)->values();

        // Option groups, ordered size first then color, values in their configured order.
        $groups = [];
        foreach ($variants as $v) {
            foreach ($v->attributeValues as $av) {
                $code = $av->attribute->code;
                $groups[$code] ??= ['code' => $code, 'name' => $av->attribute->name, 'type' => $av->attribute->type, 'values' => []];
                $groups[$code]['values'][$av->id] = [
                    'id' => $av->id, 'value' => $av->value, 'hex' => $av->color_hex, 'sort' => $av->sort_order,
                ];
            }
        }
        $options = collect($groups)
            ->sortBy(fn ($g) => $g['code'] === 'color' ? 0 : 1)
            ->map(function ($g) {
                $values = collect($g['values'])->sortBy('sort')->values()->map(fn ($v) => collect($v)->except('sort')->all());

                return [...$g, 'values' => $values];
            })->values();

        return [
            ...parent::toArray($request),
            'short_description' => $p->short_description,
            'description' => $p->description,
            'breadcrumbs' => array_values(array_filter([
                $p->category?->parent ? ['name' => $p->category->parent->name, 'slug' => $p->category->parent->slug] : null,
                $p->category ? ['name' => $p->category->name, 'slug' => $p->category->slug] : null,
            ])),
            'gallery' => $p->images->where('kind', ProductImageKind::Gallery)->values()->map(fn (ProductImage $i) => [
                'url' => Media::url($i->path),
                'alt' => $i->alt ?? $p->name,
                'variant_id' => $i->variant_id,
            ]),
            'options' => $options,
            'variants' => $variants->map(fn (ProductVariant $v) => [
                'id' => $v->id,
                'sku' => $v->sku,
                'label' => $v->label(),
                'price' => $v->price,
                'compare_at_price' => ($v->compare_at_price !== null && (float) $v->compare_at_price > (float) $v->price) ? $v->compare_at_price : null,
                'option_value_ids' => $v->attributeValues->map(fn (AttributeValue $av) => $av->id)->values(),
                'in_stock' => ($v->inventory?->available() ?? 0) > 0,
                'max_quantity' => min($v->inventory?->available() ?? 0, CheckoutService::MAX_QUANTITY_PER_LINE),
                'low_stock' => ($a = $v->inventory?->available() ?? 0) > 0 && $a <= self::LOW_STOCK,
                'is_default' => (bool) $v->is_default,
            ]),
            'rating' => ['average' => (float) $p->rating_avg, 'count' => (int) $p->rating_count],
            'meta' => [
                'title' => $p->meta_title ?: "{$p->name} | Cartix",
                'description' => $p->meta_description ?: ($p->short_description ?? ''),
            ],
        ];
    }
}
