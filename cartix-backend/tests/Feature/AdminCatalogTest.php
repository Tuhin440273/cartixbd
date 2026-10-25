<?php

namespace Tests\Feature;

use App\Enums\ProductStatus;
use App\Models\ActivityLog;
use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\Checkout\CheckoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Concerns\BuildsStore;
use Tests\TestCase;

class AdminCatalogTest extends TestCase
{
    use BuildsStore, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        Sanctum::actingAs($this->admin());
    }

    private function sizeId(string $value): int
    {
        return (int) Attribute::query()->where('code', 'size')->firstOrFail()->values()->where('value', $value)->value('id');
    }

    private function colorId(string $value): int
    {
        return (int) Attribute::query()->where('code', 'color')->firstOrFail()->values()->where('value', $value)->value('id');
    }

    public function test_product_list_filters_by_search_status_category_and_stock(): void
    {
        $inStock = $this->makeVariant(stock: 20);
        $out = $this->makeVariant(stock: 0);
        $low = $this->makeVariant(stock: 2);
        $out->product->update(['status' => ProductStatus::Draft]);

        $this->getJson('/api/admin/products?stock=out')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $out->product_id);
        $this->getJson('/api/admin/products?stock=low')->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $low->product_id);
        $this->getJson('/api/admin/products?stock=in')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/admin/products?status=draft')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/admin/products?q='.$inStock->sku)->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $inStock->product_id);
        $men = Category::query()->where('slug', 'men')->value('id');
        $this->getJson("/api/admin/products?category_id={$men}")->assertJsonPath('meta.total', 3);
        $women = Category::query()->where('slug', 'women')->value('id');
        $this->getJson("/api/admin/products?category_id={$women}")->assertJsonPath('meta.total', 0);
    }

    public function test_product_can_be_viewed_and_edited_with_a_unique_slug(): void
    {
        $a = $this->makeVariant()->product;
        $b = $this->makeVariant()->product;

        $this->getJson("/api/admin/products/{$a->id}")->assertOk()->assertJsonPath('data.name', $a->name)->assertJsonCount(1, 'data.variants');

        $body = ['name' => 'Fleece Hoodie Pro', 'category_id' => $a->category_id, 'status' => 'active', 'is_featured' => true,
            'description' => 'Warm fleece.', 'slug' => 'fleece-hoodie-pro'];
        $this->putJson("/api/admin/products/{$a->id}", $body)->assertOk()
            ->assertJsonPath('data.name', 'Fleece Hoodie Pro')->assertJsonPath('data.slug', 'fleece-hoodie-pro')->assertJsonPath('data.is_featured', true);

        $this->putJson("/api/admin/products/{$b->id}", [...$body, 'name' => 'Other'])->assertStatus(422)
            ->assertJsonPath('errors.slug.0', 'Another product already uses this URL name.');
        $this->assertTrue(ActivityLog::query()->where('action', 'product.updated')->exists());
    }

    public function test_product_cannot_be_published_without_an_active_variant(): void
    {
        $product = $this->makeVariant()->product;
        $product->variants()->update(['is_active' => false]);

        $this->patchJson("/api/admin/products/{$product->id}/status", ['status' => 'active'])->assertStatus(422)
            ->assertJsonPath('message', 'Add at least one active variant before publishing this product.');
    }

    public function test_ordered_products_are_archived_not_deleted_and_unordered_ones_are_soft_deleted(): void
    {
        $ordered = $this->makeVariant();
        app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $ordered->id, 'quantity' => 1]]));
        $this->deleteJson("/api/admin/products/{$ordered->product_id}")->assertStatus(422)
            ->assertJsonPath('message', 'This product has orders, so it cannot be deleted. Archive it instead.');
        $this->assertNotNull(Product::query()->find($ordered->product_id));

        $fresh = $this->makeVariant(stock: 3);
        $this->deleteJson("/api/admin/products/{$fresh->product_id}")->assertOk();
        $this->assertNull(Product::query()->find($fresh->product_id));
        $this->assertNotNull(Product::withTrashed()->find($fresh->product_id));
        // Stock history is kept.
        $this->assertTrue(StockMovement::query()->where('variant_id', $fresh->id)->exists());
    }

    public function test_variants_can_be_added_and_edited_with_unique_sku_and_combination(): void
    {
        $product = $this->makeVariant('1000.00')->product;
        $m = $this->sizeId('M');
        $black = $this->colorId('Black');

        $this->postJson("/api/admin/products/{$product->id}/variants", [
            'size_value_id' => $m, 'color_value_id' => $black, 'price' => '1100', 'initial_stock' => 4, 'sku' => 'hood-m-black',
        ])->assertCreated()->assertJsonCount(2, 'data.variants')->assertJsonPath('data.variants.1.sku', 'HOOD-M-BLACK')
            ->assertJsonPath('data.variants.1.available', 4);

        $this->postJson("/api/admin/products/{$product->id}/variants", [
            'size_value_id' => $m, 'color_value_id' => $black, 'price' => '1100', 'initial_stock' => 0,
        ])->assertStatus(422)->assertJsonPath('message', 'A variant with this size and color already exists.');

        $this->postJson("/api/admin/products/{$product->id}/variants", [
            'size_value_id' => $this->sizeId('L'), 'price' => '1100', 'initial_stock' => 0, 'sku' => 'HOOD-M-BLACK',
        ])->assertStatus(422)->assertJsonPath('errors.sku.0', 'Another variant already uses this SKU.');

        $variant = ProductVariant::query()->where('sku', 'HOOD-M-BLACK')->firstOrFail();
        $this->putJson("/api/admin/variants/{$variant->id}", [
            'sku' => 'HOOD-M-BLACK', 'price' => '1150', 'compare_at_price' => '1000', 'is_active' => true,
        ])->assertStatus(422)->assertJsonPath('errors.compare_at_price.0', 'The regular price must be at least the selling price.');

        $this->putJson("/api/admin/variants/{$variant->id}", [
            'sku' => 'HOOD-M-BLACK', 'price' => '1150', 'is_active' => true, 'low_stock_threshold' => 2, 'cost_price' => '700',
        ])->assertOk();
        $this->assertSame('1150.00', $variant->fresh()->price);
        $this->assertSame(2, Inventory::query()->where('variant_id', $variant->id)->value('low_stock_threshold'));
        // The product's cached price range follows its variants.
        $this->assertSame('1150.00', $product->fresh()->max_price);
    }

    public function test_a_color_can_be_added_to_a_product_for_every_size_with_zero_stock(): void
    {
        $first = $this->makeVariant('1100.00', stock: 5);
        $product = $first->product;
        $black = $this->colorId('Black');
        $first->update(['compare_at_price' => '1400', 'cost_price' => '600']);
        $first->attributeValues()->sync([$this->sizeId('S'), $black]);
        $this->postJson("/api/admin/products/{$product->id}/variants", [
            'size_value_id' => $this->sizeId('M'), 'color_value_id' => $black, 'price' => '1200', 'initial_stock' => 3,
        ])->assertCreated();

        $navy = $this->colorId('Navy');
        $response = $this->postJson("/api/admin/products/{$product->id}/colors", ['color_value_id' => $navy])
            ->assertCreated()->assertJsonCount(4, 'data.variants');
        $added = collect($response->json('data.variants'))->where('color_value_id', $navy)->sortBy('price')->values();
        $this->assertCount(2, $added);
        $this->assertSame([$this->sizeId('S'), $this->sizeId('M')], $added->pluck('size_value_id')->all());
        $this->assertSame(['1100.00', '1200.00'], $added->pluck('price')->all());
        $this->assertSame('1400.00', $added[0]['compare_at_price']);
        $this->assertSame('600.00', $added[0]['cost_price']);
        $this->assertSame([0, 0], $added->pluck('quantity')->all());
        $this->assertSame([false, false], $added->pluck('is_default')->all());
        $slug = strtoupper(Str::slug($product->name));
        $this->assertSame(["{$slug}-NAVY-S", "{$slug}-NAVY-M"], $added->pluck('sku')->all());
        $this->assertTrue(ActivityLog::query()->where('action', 'product.color_added')->exists());

        $this->postJson("/api/admin/products/{$product->id}/colors", ['color_value_id' => $navy])
            ->assertStatus(422)->assertJsonPath('message', 'This product already has this color.');
        $this->postJson("/api/admin/products/{$product->id}/colors", ['color_value_id' => $this->sizeId('S')])
            ->assertStatus(422)->assertJsonPath('errors.color_value_id.0', 'Choose one of the shop colors.');
    }

    public function test_meta_includes_the_color_attribute_for_creating_new_colors(): void
    {
        $id = Attribute::query()->where('code', 'color')->value('id');
        $this->getJson('/api/admin/meta')->assertOk()->assertJsonPath('color_attribute_id', $id);
    }

    public function test_product_images_upload_reorder_and_delete(): void
    {
        Storage::fake('public');
        $product = $this->makeVariant()->product;

        $first = $this->post("/api/admin/products/{$product->id}/images", [
            'image' => UploadedFile::fake()->image('front.jpg', 800, 1000), 'kind' => 'gallery', 'alt' => 'Front',
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->post("/api/admin/products/{$product->id}/images", [
            'image' => UploadedFile::fake()->image('back.png', 800, 1000), 'kind' => 'gallery',
        ], ['Accept' => 'application/json'])->assertCreated();

        $images = ProductImage::query()->where('product_id', $product->id)->orderBy('sort_order')->get();
        $this->assertCount(2, $images);
        Storage::disk('public')->assertExists($images[0]->path);
        $this->assertStringStartsWith("products/{$product->id}/", $images[0]->path);

        $this->putJson("/api/admin/products/{$product->id}/images/order", ['ids' => [$images[1]->id, $images[0]->id]])->assertOk()
            ->assertJsonPath('data.images.0.id', $images[1]->id);

        $this->deleteJson("/api/admin/images/{$images[0]->id}")->assertOk();
        Storage::disk('public')->assertMissing($images[0]->path);
        $this->assertNotNull($first->json('data.images.0.url'));
    }

    public function test_svg_and_oversized_uploads_are_refused(): void
    {
        Storage::fake('public');
        $product = $this->makeVariant()->product;
        $svg = UploadedFile::fake()->createWithContent('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

        $this->post("/api/admin/products/{$product->id}/images", ['image' => $svg, 'kind' => 'gallery'], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('errors.image.0', 'Upload a JPG, PNG or WebP image.');
        $this->post("/api/admin/products/{$product->id}/images", [
            'image' => UploadedFile::fake()->image('big.jpg', 900, 900)->size(5000), 'kind' => 'gallery',
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonPath('errors.image.0', 'The image must be 4 MB or smaller.');
        $this->assertSame(0, ProductImage::query()->count());
    }

    public function test_categories_and_brands_crud_with_safe_deletion(): void
    {
        Storage::fake('public');
        $men = Category::query()->where('slug', 'men')->firstOrFail();

        $res = $this->post('/api/admin/categories', ['name' => 'Polo Shirts', 'parent_id' => $men->id, 'is_active' => 1],
            ['Accept' => 'application/json'])->assertCreated();
        $polo = $res->json('data.id');
        $this->assertSame('polo-shirts', $res->json('data.slug'));

        // A child cannot become a parent (two levels only).
        $this->post('/api/admin/categories', ['name' => 'Too deep', 'parent_id' => $polo, 'is_active' => 1], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('errors.parent_id.0', 'Choose a top-level category as the parent.');

        $this->post("/api/admin/categories/{$polo}", ['name' => 'Polo shirts', 'parent_id' => $men->id, 'is_active' => 0], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.is_active', false);

        $this->deleteJson("/api/admin/categories/{$men->id}")->assertStatus(422)->assertJsonPath('message', 'Delete or move the subcategories first.');
        $hoodies = Category::query()->where('slug', 'hoodies')->value('id');
        $this->makeVariant();
        $this->deleteJson("/api/admin/categories/{$hoodies}")->assertStatus(422)
            ->assertJsonPath('message', 'This category has products. Move them or deactivate the category instead.');
        $this->deleteJson("/api/admin/categories/{$polo}")->assertOk();

        $brand = $this->post('/api/admin/brands', ['name' => 'Acme Wear', 'is_active' => 1, 'logo' => UploadedFile::fake()->image('logo.png', 300, 300)],
            ['Accept' => 'application/json'])->assertCreated();
        $this->post('/api/admin/brands', ['name' => 'Acme Wear', 'is_active' => 1], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('errors.name.0', 'A brand with this name already exists.');
        $brandId = $brand->json('data.id');
        Product::query()->firstOrFail()->update(['brand_id' => $brandId]);
        $this->deleteJson("/api/admin/brands/{$brandId}")->assertStatus(422);
        $this->getJson('/api/admin/brands')->assertOk()->assertJsonPath('data.0.product_count', 1);
        $this->assertNotNull(Brand::query()->find($brandId)?->logo);
    }

    public function test_attribute_values_can_be_added_renamed_and_only_unused_ones_deleted(): void
    {
        $size = Attribute::query()->where('code', 'size')->firstOrFail();
        $color = Attribute::query()->where('code', 'color')->firstOrFail();

        $free = $this->postJson("/api/admin/attributes/{$size->id}/values", ['value' => 'Free size'])->assertCreated()->json('data.id');
        $this->postJson("/api/admin/attributes/{$size->id}/values", ['value' => 'Free size'])->assertStatus(422)
            ->assertJsonPath('errors.value.0', 'This value already exists.');
        $this->postJson("/api/admin/attributes/{$color->id}/values", ['value' => 'Maroon Red'])->assertStatus(422)
            ->assertJsonPath('errors.color_hex.0', 'Choose a color.');
        $this->postJson("/api/admin/attributes/{$color->id}/values", ['value' => 'Mint', 'color_hex' => '#98FF98'])->assertCreated();

        $this->putJson("/api/admin/attribute-values/{$free}", ['value' => 'One size'])->assertOk()->assertJsonPath('data.value', 'One size');
        $this->deleteJson("/api/admin/attribute-values/{$free}")->assertOk();

        $used = $this->sizeId('M');
        ProductVariant::query()->firstOr(fn () => $this->makeVariant())->attributeValues()->attach($used);
        $this->deleteJson("/api/admin/attribute-values/{$used}")->assertStatus(422)
            ->assertJsonPath('message', 'This value is used by product variants, so it cannot be deleted.');
        $this->getJson('/api/admin/attributes')->assertOk()->assertJsonPath('data.0.code', 'size');
    }

    public function test_inventory_list_adjustments_and_history_prevent_negative_stock(): void
    {
        $variant = $this->makeVariant(stock: 5);
        $this->makeVariant(stock: 0);

        $this->getJson('/api/admin/inventory?stock=out')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/admin/inventory?q='.$variant->sku)->assertJsonPath('data.0.available', 5);

        $this->postJson("/api/admin/variants/{$variant->id}/stock", ['change' => 10, 'reason' => 'purchase', 'note' => 'New batch'])
            ->assertOk()->assertJsonPath('data.available', 15);
        $this->postJson("/api/admin/variants/{$variant->id}/stock", ['change' => -100, 'reason' => 'adjustment'])->assertStatus(422);
        $this->postJson("/api/admin/variants/{$variant->id}/stock", ['change' => -2, 'reason' => 'purchase'])->assertStatus(422)
            ->assertJsonPath('errors.change.0', 'A purchase adds stock. Use a stock count correction to remove stock.');
        $this->assertSame(15, Inventory::query()->where('variant_id', $variant->id)->value('quantity'));

        $this->getJson("/api/admin/variants/{$variant->id}/movements")->assertOk()
            ->assertJsonPath('data.0.change', 10)->assertJsonPath('data.0.quantity_after', 15)->assertJsonPath('data.0.note', 'New batch');
        $this->assertTrue(ActivityLog::query()->where('action', 'stock.adjusted')->exists());
    }

    public function test_order_manager_can_view_but_not_change_the_catalog(): void
    {
        $manager = User::query()->create(['name' => 'Manager', 'phone' => '01822222222', 'password' => 'manager-pass-1']);
        $manager->assignRole('order_manager');
        Sanctum::actingAs($manager);
        $variant = $this->makeVariant();

        $this->getJson('/api/admin/products')->assertOk();
        $this->getJson('/api/admin/inventory')->assertOk();
        $this->putJson("/api/admin/products/{$variant->product_id}", ['name' => 'X'])->assertForbidden();
        $this->deleteJson("/api/admin/products/{$variant->product_id}")->assertForbidden();
        $this->postJson("/api/admin/variants/{$variant->id}/stock", ['change' => 5, 'reason' => 'purchase'])->assertForbidden();
        $this->getJson('/api/admin/categories')->assertForbidden();
    }
}
