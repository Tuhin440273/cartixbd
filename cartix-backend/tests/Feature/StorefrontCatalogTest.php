<?php

namespace Tests\Feature;

use App\Enums\ProductStatus;
use App\Enums\ReviewStatus;
use App\Enums\VendorStatus;
use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Review;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Checkout\CheckoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsStore;
use Tests\TestCase;

class StorefrontCatalogTest extends TestCase
{
    use BuildsStore, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    public function test_home_returns_only_real_sections_and_empty_states(): void
    {
        $this->getJson('/api/v1/home')->assertOk()
            ->assertJsonPath('featured', [])
            ->assertJsonPath('best_sellers', [])
            ->assertJsonPath('categories', [])
            ->assertJsonPath('store.payment_methods.0.code', 'cod');

        $variant = $this->makeVariant('1250.00');
        $variant->product->update(['is_featured' => true]);

        $this->getJson('/api/v1/home')->assertOk()
            ->assertJsonCount(1, 'featured')
            ->assertJsonPath('featured.0.price', '1250.00')
            ->assertJsonPath('categories.0.slug', 'men')
            ->assertJsonPath('best_sellers', []);
    }

    public function test_listing_hides_draft_future_unapproved_and_inactive_products(): void
    {
        $visible = $this->makeVariant();
        $this->makeVariant()->product->update(['status' => ProductStatus::Draft]);
        $this->makeVariant()->product->update(['published_at' => now()->addDay()]);
        $this->makeVariant()->update(['is_active' => false]);

        $seller = $this->makeSeller();
        $seller->forceFill(['status' => VendorStatus::Suspended])->save();
        $this->makeVariant(vendorId: $seller->id);

        $this->getJson('/api/v1/products')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.slug', $visible->product->slug);
    }

    public function test_filters_sorting_search_and_pagination(): void
    {
        $cheap = $this->makeVariant('500.00');
        $mid = $this->makeVariant('900.00');
        $dear = $this->makeVariant('1500.00', stock: 0);
        $brand = Brand::query()->create(['name' => 'Acme Wear', 'slug' => 'acme-wear', 'is_active' => true]);
        $mid->product->update(['brand_id' => $brand->id, 'name' => 'Navy Fleece Hoodie']);

        $size = Attribute::query()->where('code', 'size')->first();
        $m = $size->values()->where('value', 'M')->first();
        $cheap->attributeValues()->attach($m->id);

        $this->getJson('/api/v1/products?sort=price_asc')->assertOk()
            ->assertJsonPath('data.0.price', '500.00')->assertJsonPath('data.2.price', '1500.00');
        $this->getJson('/api/v1/products?sort=price_desc')->assertJsonPath('data.0.price', '1500.00');
        $this->getJson('/api/v1/products?min_price=600&max_price=1000')->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.price', '900.00');
        $this->getJson('/api/v1/products?brand=acme-wear')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/products?q=fleece')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/products?in_stock=1')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/products?size[]=M')->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.slug', $cheap->product->slug);
        $this->getJson('/api/v1/products?category=men')->assertJsonPath('meta.total', 3);
        $this->getJson('/api/v1/products?category=women')->assertJsonPath('meta.total', 0);
        $this->getJson('/api/v1/products?per_page=2&page=2')->assertJsonPath('meta.last_page', 2)->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/products?category=no-such-category')->assertNotFound();
    }

    public function test_listing_rejects_invalid_parameters_with_english_messages(): void
    {
        $this->getJson('/api/v1/products?sort=random')->assertStatus(422)
            ->assertJsonPath('errors.sort.0', 'Sort must be one of: featured, newest, price_asc, price_desc, best_selling.');
        $this->getJson('/api/v1/products?min_price=900&max_price=100')->assertStatus(422)
            ->assertJsonPath('errors.max_price.0', 'The maximum price must be at least the minimum price.');
        $this->getJson('/api/v1/products?per_page=500')->assertStatus(422);
    }

    public function test_product_detail_with_variants_and_only_approved_reviews(): void
    {
        $variant = $this->makeVariant('1250.00', stock: 3);
        $product = $variant->product;
        $order = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        $item = $order->items->first();
        $user = User::query()->create(['name' => 'Nusrat Jahan', 'phone' => '01811111111', 'password' => 'secret-pass']);
        Review::query()->create(['product_id' => $product->id, 'user_id' => $user->id, 'order_item_id' => $item->id,
            'rating' => 5, 'comment' => 'Warm and well stitched.', 'status' => ReviewStatus::Approved]);

        $second = $this->makeVariant();
        $order2 = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $second->id, 'quantity' => 1]]));
        Review::query()->create(['product_id' => $product->id, 'user_id' => $user->id, 'order_item_id' => $order2->items->first()->id,
            'rating' => 1, 'comment' => 'Pending review', 'status' => ReviewStatus::Pending]);

        $res = $this->getJson("/api/v1/products/{$product->slug}")->assertOk()
            ->assertJsonPath('data.name', $product->name)
            ->assertJsonPath('data.variants.0.price', '1250.00')
            ->assertJsonPath('data.variants.0.max_quantity', 2)
            ->assertJsonPath('data.variants.0.low_stock', true)
            ->assertJsonCount(1, 'reviews')
            ->assertJsonPath('reviews.0.author', 'Nusrat')
            ->assertJsonPath('data.breadcrumbs.0.slug', 'men');
        $this->assertStringNotContainsString('01811111111', $res->getContent());

        $this->getJson('/api/v1/products/does-not-exist')->assertNotFound()
            ->assertJsonPath('message', 'This product is not available.');
    }

    public function test_category_tree_brands_and_locations(): void
    {
        $this->makeVariant();
        $this->getJson('/api/v1/categories')->assertOk()
            ->assertJsonFragment(['slug' => 'hoodies', 'product_count' => 1]);
        $this->getJson('/api/v1/categories/men')->assertOk()->assertJsonPath('data.name', 'Men');
        $this->getJson('/api/v1/categories/unknown')->assertNotFound();
        $this->getJson('/api/v1/brands')->assertOk()->assertJsonPath('data', []);

        $divisions = $this->getJson('/api/v1/locations/divisions')->assertOk()->json('data');
        $this->assertCount(8, $divisions);
        $this->assertSame(64, array_sum(array_map(fn ($d) => count($d['districts']), $divisions)));
        $this->getJson('/api/v1/shipping/rates')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_storefront_responses_never_expose_internal_fields(): void
    {
        $variant = $this->makeVariant();
        $body = $this->getJson("/api/v1/products/{$variant->product->slug}")->getContent()
            .$this->getJson('/api/v1/home')->getContent();

        foreach (['cost_price', 'commission', 'vendor_earning', 'ip_address', 'owner_user_id', 'password'] as $field) {
            $this->assertStringNotContainsString($field, $body);
        }
        $this->assertTrue(ProductVariant::query()->exists() && Category::query()->exists() && Product::query()->exists() && Vendor::query()->exists());
    }
}
