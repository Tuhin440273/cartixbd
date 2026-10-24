<?php

namespace Tests\Feature;

use App\Models\Attribute;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\User;
use App\Services\Checkout\CheckoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Concerns\BuildsStore;
use Tests\TestCase;

class AdminApiTest extends TestCase
{
    use BuildsStore, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    public function test_login_with_any_phone_format_returns_token_and_wrong_password_is_rejected(): void
    {
        $admin = $this->admin();
        $admin->update(['password' => 'correct-horse-9']);

        $this->postJson('/api/admin/login', ['phone' => '+880 1700-000000', 'password' => 'wrong'])
            ->assertStatus(422)->assertJsonPath('errors.phone.0', 'The phone number or password is incorrect.');

        $res = $this->postJson('/api/admin/login', ['phone' => '+880 1700-000000', 'password' => 'correct-horse-9'])
            ->assertOk()->assertJsonStructure(['token', 'user' => ['id', 'roles', 'permissions']]);

        $this->withToken($res->json('token'))->getJson('/api/admin/me')->assertOk()->assertJsonPath('user.id', $admin->id);
    }

    public function test_customer_cannot_log_into_the_panel_and_requests_without_token_are_401(): void
    {
        $customer = User::query()->create(['name' => 'Buyer', 'phone' => '01811111111', 'password' => 'buyer-pass-1']);
        $customer->assignRole('customer');

        $this->postJson('/api/admin/login', ['phone' => '01811111111', 'password' => 'buyer-pass-1'])->assertStatus(422);
        $this->getJson('/api/admin/dashboard')->assertUnauthorized();

        Sanctum::actingAs($customer);
        $this->getJson('/api/admin/dashboard')->assertForbidden();
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/admin/login', ['phone' => '01700000000', 'password' => 'nope']);
        }
        $this->postJson('/api/admin/login', ['phone' => '01700000000', 'password' => 'nope'])->assertStatus(429);
    }

    public function test_dashboard_counts_orders_and_waiting_confirmation(): void
    {
        $variant = $this->makeVariant(stock: 2);
        app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));

        Sanctum::actingAs($this->admin());
        $this->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('kpis.today_orders', 1)
            ->assertJsonPath('kpis.waiting_confirmation', 1)
            ->assertJsonPath('kpis.today_sales', '2570.00')
            ->assertJsonCount(7, 'orders_per_day')
            ->assertJsonPath('low_stock.0.available', 0);
    }

    public function test_order_manager_confirms_and_ships_but_cannot_create_products(): void
    {
        $variant = $this->makeVariant(stock: 5);
        $order = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));

        $manager = User::query()->create(['name' => 'Manager', 'phone' => '01922222222', 'password' => 'manager-pass-1']);
        $manager->assignRole('order_manager');
        Sanctum::actingAs($manager);

        $this->getJson('/api/admin/orders?q=01712345678')->assertOk()->assertJsonPath('data.0.id', $order->id);

        $this->postJson("/api/admin/orders/{$order->id}/confirm", ['note' => 'Called, OK'])
            ->assertOk()->assertJsonPath('data.status', 'confirmed');

        $voId = $order->vendorOrders()->value('id');
        $this->postJson("/api/admin/vendor-orders/{$voId}/status", ['status' => 'shipped'])
            ->assertOk()->assertJsonPath('data.vendor_orders.0.status', 'shipped');

        // A shipped order cannot be cancelled: HTTP 422 with a readable message
        $this->postJson("/api/admin/vendor-orders/{$voId}/status", ['status' => 'cancelled'])
            ->assertStatus(422)->assertJsonPath('message', 'An order cannot move from "Shipped" to "Cancelled".');

        $this->postJson('/api/admin/products', [])->assertForbidden();
    }

    public function test_cancel_needs_a_reason(): void
    {
        $variant = $this->makeVariant();
        $order = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        Sanctum::actingAs($this->admin());

        $this->postJson("/api/admin/orders/{$order->id}/cancel", [])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->postJson("/api/admin/orders/{$order->id}/cancel", ['note' => 'Fake order'])->assertOk()->assertJsonPath('data.status', 'cancelled');
    }

    public function test_admin_creates_product_with_size_and_color_variants_and_adjusts_stock(): void
    {
        Sanctum::actingAs($this->admin());
        $sizes = Attribute::query()->where('code', 'size')->first()->values()->whereIn('value', ['M', 'L'])->pluck('id');
        $colors = Attribute::query()->where('code', 'color')->first()->values()->whereIn('value', ['Black', 'Navy', 'Grey'])->pluck('id');

        $id = $this->postJson('/api/admin/products', [
            'name' => 'Winter Hoodie',
            'category_id' => Category::query()->where('slug', 'hoodies')->value('id'),
            'price' => '1250',
            'compare_at_price' => '1550.00',
            'size_value_ids' => $sizes,
            'color_value_ids' => $colors,
            'initial_stock' => 8,
            'publish' => true,
        ])->assertCreated()->json('data.id');

        $product = Product::query()->with('variants.inventory')->findOrFail($id);
        $this->assertCount(6, $product->variants); // 2 sizes x 3 colors
        $this->assertSame('1250.00', $product->min_price);
        $this->assertSame(8, $product->variants->first()->inventory->quantity);

        $variantId = $product->variants->first()->id;
        $this->postJson("/api/admin/variants/{$variantId}/stock", ['change' => 5, 'reason' => 'purchase'])
            ->assertOk()->assertJsonPath('data.quantity', 13);
        $this->postJson("/api/admin/variants/{$variantId}/stock", ['change' => -20, 'reason' => 'adjustment'])
            ->assertStatus(422);
        $this->assertSame(13, Inventory::query()->where('variant_id', $variantId)->value('quantity'));

        $this->getJson('/api/admin/products?q=Winter')->assertOk()->assertJsonPath('data.0.stock', 13 + 8 * 5);
    }

    public function test_product_validation_rejects_bad_input(): void
    {
        Sanctum::actingAs($this->admin());
        $this->postJson('/api/admin/products', [
            'name' => '',
            'category_id' => 99999,
            'price' => '12.345',
            'compare_at_price' => '1',
            'initial_stock' => -1,
            'size_value_ids' => [Attribute::query()->where('code', 'color')->first()->values()->value('id')], // a color is not a valid size
        ])->assertStatus(422)->assertJsonValidationErrors(['name', 'category_id', 'price', 'initial_stock', 'size_value_ids.0']);
    }
}
