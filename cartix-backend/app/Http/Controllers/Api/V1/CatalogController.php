<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\ProductCardResource;
use App\Http\Resources\Storefront\ProductDetailResource;
use App\Models\AttributeValue;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Review;
use App\Services\Catalog\CatalogQuery;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CatalogController extends Controller
{
    /** Category tree (two levels) with the number of visible products in each. */
    public function categories(): JsonResponse
    {
        $counts = CatalogQuery::visibleProducts()->selectRaw('category_id, count(*) as total')
            ->groupBy('category_id')->pluck('total', 'category_id');
        $all = Category::query()->where('is_active', true)->orderBy('sort_order')->orderBy('name')->get();

        $tree = $all->whereNull('parent_id')->values()->map(function (Category $parent) use ($all, $counts) {
            $children = $all->where('parent_id', $parent->id)->values()->map(fn (Category $c) => [
                'id' => $c->id, 'name' => $c->name, 'slug' => $c->slug, 'product_count' => (int) ($counts[$c->id] ?? 0),
            ]);

            return [
                'id' => $parent->id,
                'name' => $parent->name,
                'slug' => $parent->slug,
                'product_count' => (int) ($counts[$parent->id] ?? 0) + $children->sum('product_count'),
                'children' => $children,
            ];
        });

        return response()->json(['data' => $tree]);
    }

    public function category(string $slug): JsonResponse
    {
        $category = Category::query()->with('parent:id,name,slug')->where('slug', $slug)->where('is_active', true)->first();
        abort_if($category === null, 404, 'Category not found.');

        return response()->json(['data' => [
            'id' => $category->id,
            'name' => $category->name,
            'slug' => $category->slug,
            'parent' => $category->parent ? ['name' => $category->parent->name, 'slug' => $category->parent->slug] : null,
            'children' => Category::query()->where('parent_id', $category->id)->where('is_active', true)
                ->orderBy('sort_order')->get(['name', 'slug']),
        ]]);
    }

    public function brands(): JsonResponse
    {
        $counts = CatalogQuery::visibleProducts()->whereNotNull('brand_id')
            ->selectRaw('brand_id, count(*) as total')->groupBy('brand_id')->pluck('total', 'brand_id');

        return response()->json(['data' => Brand::query()->where('is_active', true)->orderBy('name')->get()
            ->map(fn (Brand $b) => ['name' => $b->name, 'slug' => $b->slug, 'product_count' => (int) ($counts[$b->id] ?? 0)])
            ->filter(fn ($b) => $b['product_count'] > 0)->values()]);
    }

    /** Product listing with search, filters, sorting and pagination; also returns the filter options. */
    public function products(Request $request): JsonResponse
    {
        $f = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:170'],
            'brand' => ['nullable', 'string', 'max:170'],
            'collection' => ['nullable', 'string', 'max:170'],
            'min_price' => ['nullable', 'numeric', 'min:0', 'max:10000000'],
            'max_price' => ['nullable', 'numeric', 'min:0', 'max:10000000', 'gte:min_price'],
            'size' => ['nullable', 'array', 'max:20'],
            'size.*' => ['string', 'max:50'],
            'color' => ['nullable', 'array', 'max:20'],
            'color.*' => ['string', 'max:50'],
            'in_stock' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(CatalogQuery::SORTS)],
            'page' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:48'],
        ], [
            'sort.in' => 'Sort must be one of: '.implode(', ', CatalogQuery::SORTS).'.',
            'max_price.gte' => 'The maximum price must be at least the minimum price.',
        ]);

        if (! empty($f['category'])) {
            $ids = CatalogQuery::categoryIds($f['category']);
            abort_if($ids === null, 404, 'Category not found.');
            $f['category_ids'] = $ids;
        }

        $base = CatalogQuery::visibleProducts();
        if (! empty($f['collection'])) {
            $base->whereHas('collections', fn ($c) => $c->where('slug', $f['collection']));
        }

        // Filter options come from the category/search scope, before size/color/price narrow it down.
        $scope = CatalogQuery::applyFilters(clone $base, array_intersect_key($f, array_flip(['category_ids', 'q', 'brand'])));
        $filters = $this->filterOptions($scope);

        $query = CatalogQuery::applySort(CatalogQuery::applyFilters($base, $f), $f['sort'] ?? 'featured')
            ->with(CatalogQuery::cardRelations());
        $page = $query->paginate($f['per_page'] ?? 24)->withQueryString();

        return response()->json([
            'data' => ProductCardResource::collection($page->getCollection()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
            'filters' => $filters,
            'sorts' => [
                ['value' => 'featured', 'label' => 'Featured'],
                ['value' => 'newest', 'label' => 'Newest'],
                ['value' => 'price_asc', 'label' => 'Price: low to high'],
                ['value' => 'price_desc', 'label' => 'Price: high to low'],
                ['value' => 'best_selling', 'label' => 'Best selling'],
            ],
        ]);
    }

    public function product(string $slug): JsonResponse
    {
        $product = CatalogQuery::visibleProducts()
            ->where('slug', $slug)
            ->with([...CatalogQuery::cardRelations(), 'category.parent:id,name,slug'])
            ->first();
        abort_if($product === null, 404, 'This product is not available.');

        $reviews = Review::query()->with('user:id,name')
            ->where('product_id', $product->id)->where('status', ReviewStatus::Approved)
            ->latest('id')->limit(10)->get()
            ->map(fn (Review $r) => [
                'id' => $r->id,
                'rating' => $r->rating,
                'comment' => $r->comment,
                // First name only: reviewers' full names and contact details are never published.
                'author' => strtok((string) $r->user?->name, ' ') ?: 'Customer',
                'vendor_reply' => $r->vendor_reply,
                'created_at' => $r->created_at?->toIso8601String(),
            ]);

        // Same category first, then sibling categories (same parent) to fill the row.
        $related = CatalogQuery::visibleProducts()
            ->where('category_id', $product->category_id)->whereKeyNot($product->id)
            ->with(CatalogQuery::cardRelations())
            ->orderByDesc('sold_count')->orderByDesc('id')->limit(8)->get();
        $parentId = $product->category?->parent_id;
        if ($related->count() < 4 && $parentId !== null) {
            $siblings = Category::query()->where('parent_id', $parentId)->pluck('id');
            $related = $related->concat(CatalogQuery::visibleProducts()
                ->whereIn('category_id', $siblings)->where('category_id', '!=', $product->category_id)
                ->with(CatalogQuery::cardRelations())
                ->orderByDesc('sold_count')->orderByDesc('id')->limit(8 - $related->count())->get());
        }

        return response()->json([
            'data' => new ProductDetailResource($product),
            'reviews' => $reviews,
            'related' => ProductCardResource::collection($related),
        ]);
    }

    /**
     * @param  Builder<Product>  $scope
     * @return array<string, mixed>
     */
    private function filterOptions($scope): array
    {
        $ids = (clone $scope)->pluck('products.id');
        $values = AttributeValue::query()
            ->with('attribute:id,code')
            ->whereHas('attribute', fn ($a) => $a->whereIn('code', ['size', 'color']))
            ->whereHas('variants', fn ($v) => $v->whereIn('product_id', $ids)->where('is_active', true))
            ->orderBy('sort_order')->get();

        $prices = (clone $scope)->selectRaw('min(min_price) as lo, max(max_price) as hi')->reorder()->first();

        return [
            'sizes' => $values->filter(fn ($v) => $v->attribute->code === 'size')->pluck('value')->values(),
            'colors' => $values->filter(fn ($v) => $v->attribute->code === 'color')
                ->map(fn ($v) => ['name' => $v->value, 'hex' => $v->color_hex])->values(),
            'brands' => Brand::query()->whereIn('id', (clone $scope)->whereNotNull('brand_id')->select('brand_id'))
                ->orderBy('name')->get(['name', 'slug']),
            'price' => ['min' => $prices?->lo, 'max' => $prices?->hi],
        ];
    }
}
