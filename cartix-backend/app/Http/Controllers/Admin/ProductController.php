<?php

namespace App\Http\Controllers\Admin;

use App\Enums\ProductImageKind;
use App\Enums\ProductStatus;
use App\Enums\StockMovementReason;
use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Vendor;
use App\Services\Admin\ActivityLogger;
use App\Services\Admin\ImageStore;
use App\Services\InventoryService;
use App\Support\Media;
use App\Support\Slug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class ProductController extends Controller
{
    /** Statuses an admin can set. pending_review and rejected belong to the future vendor approval flow. */
    private const EDITABLE_STATUSES = ['draft', 'active', 'archived'];

    public function __construct(
        private readonly InventoryService $inventory,
        private readonly ActivityLogger $activity,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::enum(ProductStatus::class)],
            'category_id' => ['nullable', 'integer'],
            'stock' => ['nullable', Rule::in(['in', 'low', 'out'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = Product::query()
            ->with(['category', 'variants.inventory', 'variants.attributeValues',
                'images' => fn ($q) => $q->where('kind', ProductImageKind::Gallery)->orderBy('sort_order')])
            ->latest('id');

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(fn ($w) => $w->where('name', 'like', $like)
                ->orWhereHas('variants', fn ($v) => $v->where('sku', 'like', $like)));
        }
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        if (! empty($data['category_id'])) {
            $ids = Category::query()->where('parent_id', $data['category_id'])->pluck('id')->push((int) $data['category_id']);
            $query->whereIn('category_id', $ids);
        }
        if (! empty($data['stock'])) {
            $available = 'inventories.quantity - inventories.reserved_quantity';
            $has = fn (string $condition) => fn ($v) => $v->where('is_active', true)
                ->whereHas('inventory', fn ($i) => $i->whereRaw($condition));
            match ($data['stock']) {
                'out' => $query->whereDoesntHave('variants', $has("{$available} > 0")),
                'low' => $query->whereHas('variants', $has("{$available} > 0 AND {$available} <= inventories.low_stock_threshold")),
                'in' => $query->whereHas('variants', $has("{$available} > 0")),
            };
        }

        $page = $query->paginate(20);

        return response()->json([
            'data' => collect($page->items())->map(fn (Product $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'slug' => $p->slug,
                'category' => $p->category?->name,
                'status' => $p->status->value,
                'status_label' => $p->status->label(),
                'is_featured' => $p->is_featured,
                'image' => Media::url($p->images->first()?->path),
                'min_price' => $p->min_price,
                'max_price' => $p->max_price,
                'sold_count' => $p->sold_count,
                'stock' => $p->variants->sum(fn (ProductVariant $v) => $v->inventory?->available() ?? 0),
                'variants' => $p->variants->map(fn (ProductVariant $v) => [
                    'id' => $v->id,
                    'sku' => $v->sku,
                    'label' => $v->label(),
                    'price' => $v->price,
                    'is_active' => $v->is_active,
                    'quantity' => $v->inventory?->quantity ?? 0,
                    'reserved' => $v->inventory?->reserved_quantity ?? 0,
                    'available' => $v->inventory?->available() ?? 0,
                    'low' => $v->inventory?->isLow() ?? true,
                ]),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(['data' => $this->detail($product)]);
    }

    /** Create every size x color variant at once, each with opening stock. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:20000'],
            'price' => ['required', 'decimal:0,2', 'min:1', 'max:1000000'],
            'compare_at_price' => ['nullable', 'decimal:0,2', 'gte:price', 'max:1000000'],
            'cost_price' => ['nullable', 'decimal:0,2', 'min:0', 'max:1000000'],
            'weight_grams' => ['nullable', 'integer', 'min:1', 'max:50000'],
            'size_value_ids' => ['array', 'max:12'],
            'size_value_ids.*' => ['integer', 'distinct', $this->attributeValueRule('size')],
            'color_value_ids' => ['array', 'max:12'],
            'color_value_ids.*' => ['integer', 'distinct', $this->attributeValueRule('color')],
            'initial_stock' => ['required', 'integer', 'min:0', 'max:10000'],
            'publish' => ['boolean'],
        ]);

        $product = DB::transaction(function () use ($data, $request) {
            $publish = (bool) ($data['publish'] ?? false);
            $product = Product::query()->create([
                'vendor_id' => Vendor::CARTIX_OFFICIAL_ID,
                'category_id' => $data['category_id'],
                'brand_id' => $data['brand_id'] ?? null,
                'name' => $data['name'],
                'slug' => Slug::unique(Product::class, $data['name'], fallback: 'product'),
                'short_description' => $data['short_description'] ?? null,
                'description' => $data['description'] ?? null,
                'status' => $publish ? ProductStatus::Active : ProductStatus::Draft,
                'published_at' => $publish ? now() : null,
            ]);

            $sizes = ($data['size_value_ids'] ?? []) ?: [null];
            $colors = ($data['color_value_ids'] ?? []) ?: [null];
            $first = true;
            foreach ($colors as $colorId) {
                foreach ($sizes as $sizeId) {
                    $this->createVariant($product, [
                        'price' => $data['price'],
                        'compare_at_price' => $data['compare_at_price'] ?? null,
                        'cost_price' => $data['cost_price'] ?? null,
                        'weight_grams' => $data['weight_grams'] ?? null,
                        'is_default' => $first,
                    ], array_values(array_filter([$sizeId, $colorId])), (int) $data['initial_stock'], $request->user()->id);
                    $first = false;
                }
            }
            $product->refreshPriceRange();

            return $product;
        });

        $this->activity->log('product.created', $product, ['name' => $product->name]);

        return response()->json(['data' => ['id' => $product->id, 'slug' => $product->slug]], 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'slug' => ['nullable', 'string', 'max:220', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('products', 'slug')->ignore($product->id)],
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:20000'],
            'status' => ['required', Rule::in(self::EDITABLE_STATUSES)],
            'is_featured' => ['boolean'],
            'meta_title' => ['nullable', 'string', 'max:200'],
            'meta_description' => ['nullable', 'string', 'max:500'],
        ], [
            'slug.regex' => 'The URL name may contain only lowercase letters, digits and single hyphens.',
            'slug.unique' => 'Another product already uses this URL name.',
        ]);

        $status = ProductStatus::from($data['status']);
        $this->assertPublishable($product, $status);

        $before = $product->only(['name', 'status', 'category_id']);
        $product->update([
            ...collect($data)->except(['status', 'slug'])->all(),
            'slug' => $data['slug'] ?? $product->slug,
            'is_featured' => (bool) ($data['is_featured'] ?? $product->is_featured),
            'status' => $status,
            'published_at' => $status === ProductStatus::Active ? ($product->published_at ?? now()) : $product->published_at,
        ]);

        $this->activity->log('product.updated', $product, [
            'name' => $product->name,
            'status' => [$before['status']->value, $status->value],
        ]);

        return response()->json(['data' => $this->detail($product->refresh())]);
    }

    public function updateStatus(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(self::EDITABLE_STATUSES)]]);
        $status = ProductStatus::from($data['status']);
        $this->assertPublishable($product, $status);

        $old = $product->status;
        $product->update([
            'status' => $status,
            'published_at' => $status === ProductStatus::Active ? ($product->published_at ?? now()) : $product->published_at,
        ]);
        $this->activity->log('product.status_changed', $product, ['from' => $old->value, 'to' => $status->value]);

        return response()->json(['data' => ['id' => $product->id, 'status' => $status->value, 'status_label' => $status->label()]]);
    }

    /**
     * Deletes a product that was never ordered (soft delete: stock history stays intact).
     * Products with orders must be archived instead, so order history keeps its product.
     */
    public function destroy(Product $product): JsonResponse
    {
        if (OrderItem::query()->where('product_id', $product->id)->exists()) {
            throw new DomainRuleException('This product has orders, so it cannot be deleted. Archive it instead.');
        }
        DB::transaction(function () use ($product) {
            $product->collections()->detach();
            $product->forceFill(['status' => ProductStatus::Archived])->save();
            $product->delete();
        });
        $this->activity->log('product.deleted', $product, ['name' => $product->name]);

        return response()->json(['message' => 'Product deleted.']);
    }

    public function storeVariant(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'size_value_id' => ['nullable', 'integer', $this->attributeValueRule('size')],
            'color_value_id' => ['nullable', 'integer', $this->attributeValueRule('color')],
            'sku' => $this->skuRules(),
            'price' => ['required', 'decimal:0,2', 'min:1', 'max:1000000'],
            'compare_at_price' => ['nullable', 'decimal:0,2', 'gte:price', 'max:1000000'],
            'cost_price' => ['nullable', 'decimal:0,2', 'min:0', 'max:1000000'],
            'weight_grams' => ['nullable', 'integer', 'min:1', 'max:50000'],
            'initial_stock' => ['required', 'integer', 'min:0', 'max:10000'],
        ], $this->skuMessages());

        $valueIds = array_values(array_filter([$data['size_value_id'] ?? null, $data['color_value_id'] ?? null]));
        $variant = DB::transaction(function () use ($product, $data, $valueIds, $request) {
            Product::query()->whereKey($product->id)->lockForUpdate()->first();
            $this->assertUniqueCombination($product, $valueIds);
            $variant = $this->createVariant($product, [
                'sku' => isset($data['sku']) ? strtoupper($data['sku']) : null,
                'price' => $data['price'],
                'compare_at_price' => $data['compare_at_price'] ?? null,
                'cost_price' => $data['cost_price'] ?? null,
                'weight_grams' => $data['weight_grams'] ?? null,
                'is_default' => ! $product->variants()->exists(),
            ], $valueIds, (int) $data['initial_stock'], $request->user()->id);

            return $variant;
        });
        $this->activity->log('variant.created', $variant, ['sku' => $variant->sku]);

        return response()->json(['data' => $this->detail($product->refresh())], 201);
    }

    public function updateVariant(Request $request, ProductVariant $variant): JsonResponse
    {
        $data = $request->validate([
            'sku' => ['required', ...array_slice($this->skuRules($variant->id), 1)],
            'price' => ['required', 'decimal:0,2', 'min:1', 'max:1000000'],
            'compare_at_price' => ['nullable', 'decimal:0,2', 'gte:price', 'max:1000000'],
            'cost_price' => ['nullable', 'decimal:0,2', 'min:0', 'max:1000000'],
            'weight_grams' => ['nullable', 'integer', 'min:1', 'max:50000'],
            'is_active' => ['required', 'boolean'],
            'is_default' => ['boolean'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0', 'max:10000'],
        ], $this->skuMessages());

        $product = $variant->product()->firstOrFail();
        $old = $variant->only(['sku', 'price', 'is_active']);
        DB::transaction(function () use ($variant, $data, $product) {
            if (($data['is_default'] ?? false) === true) {
                $product->variants()->whereKeyNot($variant->id)->update(['is_default' => false]);
            }
            $variant->update([
                'sku' => strtoupper($data['sku']),
                'price' => $data['price'],
                'compare_at_price' => $data['compare_at_price'] ?? null,
                'cost_price' => $data['cost_price'] ?? null,
                'weight_grams' => $data['weight_grams'] ?? null,
                'is_active' => $data['is_active'],
                'is_default' => $data['is_default'] ?? $variant->is_default,
            ]);
            if (isset($data['low_stock_threshold'])) {
                $variant->inventory()->firstOrCreate([])->update(['low_stock_threshold' => $data['low_stock_threshold']]);
            }
        });
        $this->activity->log('variant.updated', $variant, [
            'sku' => $variant->sku,
            'price' => [(string) $old['price'], (string) $variant->price],
            'is_active' => $variant->is_active,
        ]);

        return response()->json(['data' => $this->detail($product->refresh())]);
    }

    public function storeImage(Request $request, Product $product, ImageStore $store): JsonResponse
    {
        $data = $request->validate([
            'image' => ImageStore::rules(),
            'kind' => ['required', Rule::enum(ProductImageKind::class)],
            'variant_id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('product_id', $product->id)],
            'alt' => ['nullable', 'string', 'max:200'],
        ], ImageStore::messages('image'));

        $kind = ProductImageKind::from($data['kind']);
        $path = $store->store($request->file('image'), "products/{$product->id}");

        $image = DB::transaction(function () use ($product, $kind, $data, $path, $store) {
            // A product has one image of each hanging-rail view; a new upload replaces the old one.
            if ($kind !== ProductImageKind::Gallery) {
                $product->images()->where('kind', $kind)->get()->each(function (ProductImage $old) use ($store) {
                    $store->delete($old->path);
                    $old->delete();
                });
            }

            return $product->images()->create([
                'variant_id' => $data['variant_id'] ?? null,
                'path' => $path,
                'alt' => $data['alt'] ?? $product->name,
                'kind' => $kind,
                'sort_order' => (int) $product->images()->where('kind', $kind)->max('sort_order') + 1,
            ]);
        });
        $this->activity->log('product.image_added', $product, ['image_id' => $image->id, 'kind' => $kind->value]);

        return response()->json(['data' => $this->detail($product->refresh())], 201);
    }

    public function updateImage(Request $request, ProductImage $image): JsonResponse
    {
        $data = $request->validate([
            'alt' => ['nullable', 'string', 'max:200'],
            'variant_id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('product_id', $image->product_id)],
        ]);
        $image->update(['alt' => $data['alt'] ?? null, 'variant_id' => $data['variant_id'] ?? null]);

        return response()->json(['data' => $this->detail($image->product()->firstOrFail())]);
    }

    /** Saves the gallery order: the first image is the one shown in listings. */
    public function reorderImages(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:50'],
            'ids.*' => ['integer', 'distinct', Rule::exists('product_images', 'id')->where('product_id', $product->id)],
        ]);
        DB::transaction(function () use ($data) {
            foreach ($data['ids'] as $i => $id) {
                ProductImage::query()->whereKey($id)->update(['sort_order' => $i + 1]);
            }
        });

        return response()->json(['data' => $this->detail($product->refresh())]);
    }

    public function destroyImage(ProductImage $image, ImageStore $store): JsonResponse
    {
        $product = $image->product()->firstOrFail();
        $store->delete($image->path);
        $image->delete();
        $this->activity->log('product.image_removed', $product, ['image_id' => $image->id]);

        return response()->json(['data' => $this->detail($product)]);
    }

    /** @return array<string, mixed> */
    private function detail(Product $product): array
    {
        $product->load(['variants' => fn ($q) => $q->orderBy('id'), 'variants.inventory', 'variants.attributeValues.attribute',
            'images' => fn ($q) => $q->orderBy('kind')->orderBy('sort_order')]);

        return [
            'id' => $product->id,
            'name' => $product->name,
            'slug' => $product->slug,
            'category_id' => $product->category_id,
            'brand_id' => $product->brand_id,
            'short_description' => $product->short_description,
            'description' => $product->description,
            'status' => $product->status->value,
            'status_label' => $product->status->label(),
            'is_featured' => $product->is_featured,
            'meta_title' => $product->meta_title,
            'meta_description' => $product->meta_description,
            'published_at' => $product->published_at?->toIso8601String(),
            'sold_count' => $product->sold_count,
            'has_orders' => OrderItem::query()->where('product_id', $product->id)->exists(),
            'variants' => $product->variants->map(fn (ProductVariant $v) => [
                'id' => $v->id,
                'sku' => $v->sku,
                'label' => $v->label(),
                'size_value_id' => $v->attributeValues->first(fn ($a) => $a->attribute?->code === 'size')?->id,
                'color_value_id' => $v->attributeValues->first(fn ($a) => $a->attribute?->code === 'color')?->id,
                'price' => $v->price,
                'compare_at_price' => $v->compare_at_price,
                'cost_price' => $v->cost_price,
                'weight_grams' => $v->weight_grams,
                'is_default' => $v->is_default,
                'is_active' => $v->is_active,
                'quantity' => $v->inventory?->quantity ?? 0,
                'reserved' => $v->inventory?->reserved_quantity ?? 0,
                'available' => $v->inventory?->available() ?? 0,
                'low_stock_threshold' => $v->inventory?->low_stock_threshold ?? 5,
            ])->values(),
            'images' => $product->images->map(fn (ProductImage $i) => [
                'id' => $i->id,
                'url' => Media::url($i->path),
                'kind' => $i->kind->value,
                'variant_id' => $i->variant_id,
                'alt' => $i->alt,
                'sort_order' => $i->sort_order,
            ])->values(),
        ];
    }

    /** @param  list<int>  $valueIds */
    private function createVariant(Product $product, array $fields, array $valueIds, int $stock, int $userId): ProductVariant
    {
        $variant = ProductVariant::query()->create([
            ...$fields,
            'product_id' => $product->id,
            'sku' => $fields['sku'] ?? $this->generateSku($product->name),
        ]);
        $variant->attributeValues()->sync($valueIds);
        if ($stock > 0) {
            $this->inventory->adjust($variant->id, $stock, StockMovementReason::Purchase, $userId, 'Opening stock');
        } else {
            $variant->inventory()->create([]);
        }

        return $variant;
    }

    private function generateSku(string $name): string
    {
        $prefix = strtoupper(Str::limit(Str::slug($name, ''), 12, '')) ?: 'SKU';
        do {
            $sku = $prefix.'-'.strtoupper(Str::random(6));
        } while (ProductVariant::withTrashed()->where('sku', $sku)->exists());

        return $sku;
    }

    /** @param  list<int>  $valueIds */
    private function assertUniqueCombination(Product $product, array $valueIds): void
    {
        sort($valueIds);
        foreach ($product->variants()->with('attributeValues')->get() as $existing) {
            $ids = $existing->attributeValues->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            if ($ids === $valueIds) {
                throw new DomainRuleException('A variant with this size and color already exists.');
            }
        }
    }

    private function assertPublishable(Product $product, ProductStatus $status): void
    {
        if ($status === ProductStatus::Active && ! $product->variants()->where('is_active', true)->exists()) {
            throw new DomainRuleException('Add at least one active variant before publishing this product.');
        }
    }

    private function attributeValueRule(string $code): Exists
    {
        return Rule::exists('attribute_values', 'id')->where('attribute_id', Attribute::query()->where('code', $code)->value('id'));
    }

    /** @return list<mixed> */
    private function skuRules(?int $ignoreId = null): array
    {
        return ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9][A-Za-z0-9._-]*$/',
            Rule::unique('product_variants', 'sku')->ignore($ignoreId)];
    }

    /** @return array<string, string> */
    private function skuMessages(): array
    {
        return [
            'sku.regex' => 'The SKU may contain letters, digits, dots, hyphens and underscores, and must start with a letter or digit.',
            'sku.unique' => 'Another variant already uses this SKU.',
            'compare_at_price.gte' => 'The regular price must be at least the selling price.',
        ];
    }
}
