<?php

namespace App\Http\Resources\Storefront;

use App\Enums\ProductImageKind;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public product summary for grids and carousels.
 * Never includes cost prices, vendor details or exact inventory counts.
 *
 * @mixin Product
 */
class ProductCardResource extends JsonResource
{
    /** Show "Only N left" at or below this many units. */
    public const LOW_STOCK = 5;

    public function toArray(Request $request): array
    {
        /** @var Product $p */
        $p = $this->resource;
        $variants = $p->variants->where('is_active', true);
        $cheapest = $variants->sortBy(fn (ProductVariant $v) => (float) $v->price)->first();
        $available = $variants->sum(fn (ProductVariant $v) => $v->inventory?->available() ?? 0);
        $gallery = $p->images->where('kind', ProductImageKind::Gallery)->values();

        $compare = $cheapest?->compare_at_price;
        $price = $cheapest?->price;
        $discount = ($compare !== null && $price !== null && (float) $compare > (float) $price)
            ? (int) round((1 - (float) $price / (float) $compare) * 100)
            : null;

        $colors = $variants->flatMap(fn (ProductVariant $v) => $v->attributeValues)
            ->filter(fn ($av) => $av->attribute?->code === 'color')
            ->unique('id')->sortBy('sort_order')->values()
            ->map(fn ($av) => ['name' => $av->value, 'hex' => $av->color_hex]);

        return [
            'id' => $p->id,
            'slug' => $p->slug,
            'name' => $p->name,
            'category' => $p->category ? ['name' => $p->category->name, 'slug' => $p->category->slug] : null,
            'brand' => $p->brand ? ['name' => $p->brand->name, 'slug' => $p->brand->slug] : null,
            'price' => $price,
            'max_price' => $p->max_price,
            'compare_at_price' => $discount !== null ? $compare : null,
            'discount_percent' => $discount,
            'in_stock' => $available > 0,
            'low_stock' => $available > 0 && $available <= self::LOW_STOCK,
            'image' => self::image($gallery->first()),
            'hover_image' => self::image($gallery->get(1)),
            'rail' => self::rail($p),
            'colors' => $colors,
            'is_featured' => (bool) $p->is_featured,
        ];
    }

    /** @return array{url: string|null, alt: string}|null */
    public static function image(?ProductImage $image): ?array
    {
        return $image ? ['url' => Media::url($image->path), 'alt' => $image->alt ?? ''] : null;
    }

    /** Hanging-rail artwork, only when the product has the full set of rail images. */
    private static function rail(Product $p): ?array
    {
        $side = $p->images->firstWhere('kind', ProductImageKind::RailSide);
        $front = $p->images->firstWhere('kind', ProductImageKind::RailFront);
        if (! $side || ! $front) {
            return null;
        }
        $back = $p->images->firstWhere('kind', ProductImageKind::RailBack);

        return [
            'side' => Media::url($side->path),
            'front' => Media::url($front->path),
            'back' => $back ? Media::url($back->path) : null,
        ];
    }
}
