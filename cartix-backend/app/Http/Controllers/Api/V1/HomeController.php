<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CollectionType;
use App\Enums\PaymentMethod;
use App\Enums\ProductImageKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\ProductCardResource;
use App\Models\Banner;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductCollection;
use App\Models\ShippingRate;
use App\Services\Catalog\CatalogQuery;
use App\Support\Media;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/** Everything the storefront homepage needs in one request. Every section comes from the database. */
class HomeController extends Controller
{
    private const SECTION_SIZE = 8;

    public function __invoke(): JsonResponse
    {
        $now = now();
        $live = fn (Builder $q) => $q->where('is_active', true)
            ->where(fn ($s) => $s->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($e) => $e->whereNull('ends_at')->orWhere('ends_at', '>=', $now));

        $banners = Banner::query()->tap($live)->where('position', 'home_hero')->orderBy('sort_order')->get()
            ->map(fn (Banner $b) => [
                'id' => $b->id,
                'title' => $b->title,
                'image_desktop' => Media::url($b->image_desktop),
                'image_mobile' => Media::url($b->image_mobile ?? $b->image_desktop),
                'link_url' => $b->link_url,
            ]);

        $cards = fn (Builder $q) => ProductCardResource::collection(
            $q->with(CatalogQuery::cardRelations())->limit(self::SECTION_SIZE)->get()
        );

        $collections = ProductCollection::query()->tap($live)->orderBy('id')->get()->map(function (ProductCollection $c) {
            $products = CatalogQuery::visibleProducts()
                ->whereHas('collections', fn ($q) => $q->whereKey($c->id))
                ->with(CatalogQuery::cardRelations())
                ->join('collection_product', fn ($j) => $j->on('collection_product.product_id', '=', 'products.id')
                    ->where('collection_product.collection_id', $c->id))
                ->orderBy('collection_product.sort_order')
                ->select('products.*')
                ->limit(24)->get();

            // A rail only shows products that have hanging-rail artwork.
            if ($c->type === CollectionType::Rail) {
                $products = $products->filter(fn (Product $p) => $p->images->contains('kind', ProductImageKind::RailFront))->values();
            }

            return [
                'name' => $c->name,
                'slug' => $c->slug,
                'type' => $c->type->value,
                'products' => ProductCardResource::collection($products),
            ];
        })->filter(fn ($c) => count($c['products']) > 0)->values();

        $topCategories = Category::query()->whereNull('parent_id')->where('is_active', true)->orderBy('sort_order')->get();
        $categories = $topCategories->map(function (Category $cat) {
            $ids = CatalogQuery::categoryIds($cat->slug) ?? [$cat->id];
            $sample = CatalogQuery::visibleProducts()->whereIn('category_id', $ids)
                ->with(['images' => fn ($q) => $q->where('kind', ProductImageKind::Gallery)->orderBy('sort_order')])
                ->orderByDesc('is_featured')->orderByDesc('sold_count')->first();
            $count = CatalogQuery::visibleProducts()->whereIn('category_id', $ids)->count();

            return [
                'name' => $cat->name,
                'slug' => $cat->slug,
                'product_count' => $count,
                'image' => $cat->image
                    ? ['url' => Media::url($cat->image), 'alt' => $cat->name]
                    : ProductCardResource::image($sample?->images->first()),
            ];
        })->filter(fn ($c) => $c['product_count'] > 0)->values();

        $rates = ShippingRate::query()->where('is_active', true)->orderBy('base_fee')->get();

        return response()->json([
            'banners' => $banners,
            'categories' => $categories,
            'featured' => $cards(CatalogQuery::visibleProducts()->where('is_featured', true)->orderByDesc('sold_count')->orderByDesc('id')),
            'new_arrivals' => $cards(CatalogQuery::visibleProducts()->orderByDesc('published_at')->orderByDesc('id')),
            'best_sellers' => $cards(CatalogQuery::visibleProducts()->where('sold_count', '>', 0)->orderByDesc('sold_count')->orderByDesc('id')),
            'collections' => $collections,
            'store' => [
                'delivery_from' => $rates->first()?->base_fee,
                'delivery_zones' => $rates->map(fn (ShippingRate $r) => [
                    'zone' => $r->zone->value, 'label' => $r->zone->label(), 'fee' => $r->base_fee,
                    'min_days' => $r->min_days, 'max_days' => $r->max_days,
                ]),
                'payment_methods' => collect(config('cartix.payment_methods'))
                    ->map(fn (string $m) => ['code' => $m, 'label' => PaymentMethod::from($m)->label()])->values(),
            ],
        ]);
    }
}
