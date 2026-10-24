<?php

namespace Tests\Feature;

use App\Enums\CouponType;
use App\Enums\OrderStatus;
use App\Enums\ReservationStatus;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\District;
use App\Models\Inventory;
use App\Models\InventoryReservation;
use App\Models\Order;
use App\Models\ProductVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\BuildsStore;
use Tests\TestCase;

class StorefrontCheckoutTest extends TestCase
{
    use BuildsStore, RefreshDatabase;

    private int $dhaka;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        $this->dhaka = (int) District::query()->where('name', 'Dhaka')->value('id');
    }

    private function addToCart(int $variantId, int $qty = 1, ?string $token = null): TestResponse
    {
        // Headers set with withHeaders() persist for the rest of a test; start clean each time.
        $this->flushHeaders();

        return $this->withHeaders($token ? ['X-Cart-Token' => $token] : [])
            ->postJson('/api/v1/cart/items', ['variant_id' => $variantId, 'quantity' => $qty]);
    }

    /** @return array<string, mixed> */
    private function checkoutBody(array $overrides = []): array
    {
        return array_merge([
            'customer_name' => 'Rakib Hasan',
            'customer_phone' => '01712345678',
            'district_id' => $this->dhaka,
            'area_name' => 'Mirpur',
            'address_line' => 'House 12, Road 5',
            'payment_method' => 'cod',
            'accept_terms' => true,
        ], $overrides);
    }

    private function checkout(string $token, string $key = 'test-key-0000000001', array $overrides = []): TestResponse
    {
        return $this->withHeaders(['X-Cart-Token' => $token, 'Idempotency-Key' => $key])
            ->postJson('/api/v1/checkout', $this->checkoutBody($overrides));
    }

    public function test_guest_cart_token_is_random_and_only_its_hash_is_stored(): void
    {
        $variant = $this->makeVariant('1000.00');
        $res = $this->addToCart($variant->id, 2)->assertCreated()
            ->assertJsonPath('data.item_count', 2)
            ->assertJsonPath('data.subtotal', '2000.00')
            ->assertHeader('Cache-Control', 'no-store, private');
        $token = $res->json('cart_token');

        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $token);
        $this->assertDatabaseMissing('carts', ['session_token' => $token]);
        $this->assertDatabaseHas('carts', ['session_token' => hash('sha256', $token)]);

        // The same token keeps adding to the same cart, and no new token is issued.
        $this->addToCart($variant->id, 1, $token)->assertCreated()
            ->assertJsonMissingPath('cart_token')->assertJsonPath('data.items.0.quantity', 3);
        $this->assertSame(1, Cart::query()->count());
    }

    public function test_cart_update_remove_clear_and_quote(): void
    {
        $a = $this->makeVariant('1000.00');
        $b = $this->makeVariant('500.00');
        $token = $this->addToCart($a->id)->json('cart_token');
        $itemId = $this->addToCart($b->id, 1, $token)->json('data.items.1.id');

        $this->withHeaders(['X-Cart-Token' => $token])->patchJson("/api/v1/cart/items/{$itemId}", ['quantity' => 3])
            ->assertOk()->assertJsonPath('data.subtotal', '2500.00');

        $this->withHeaders(['X-Cart-Token' => $token])->getJson("/api/v1/cart?district_id={$this->dhaka}")
            // Four items of 500 g = 2 kg: 70 base fee + 20 for the second kilogram.
            ->assertOk()->assertJsonPath('data.quote.shipping', '90.00')->assertJsonPath('data.quote.total', '2590.00');

        $this->withHeaders(['X-Cart-Token' => $token])->deleteJson("/api/v1/cart/items/{$itemId}")
            ->assertOk()->assertJsonCount(1, 'data.items');
        $this->withHeaders(['X-Cart-Token' => $token])->deleteJson('/api/v1/cart')
            ->assertOk()->assertJsonPath('data.item_count', 0);
    }

    public function test_cart_items_cannot_be_changed_through_another_cart(): void
    {
        $variant = $this->makeVariant();
        $mine = $this->addToCart($variant->id)->json('cart_token');
        $theirs = $this->addToCart($variant->id);
        $theirItem = $theirs->json('data.items.0.id');

        $this->withHeaders(['X-Cart-Token' => $mine])->patchJson("/api/v1/cart/items/{$theirItem}", ['quantity' => 5])
            ->assertNotFound()->assertJsonPath('message', 'This item is not in your cart.');
        $this->withHeaders(['X-Cart-Token' => $mine])->deleteJson("/api/v1/cart/items/{$theirItem}")->assertNotFound();
        $this->withHeaders(['X-Cart-Token' => str_repeat('a', 64)])->deleteJson('/api/v1/cart')->assertNotFound();
        $this->withHeaders(['X-Cart-Token' => 'not-a-token'])->getJson('/api/v1/cart')->assertOk()->assertJsonPath('data.item_count', 0);
        $this->assertSame(1, (int) $theirs->json('data.items.0.quantity'));
    }

    public function test_expired_cart_is_not_found(): void
    {
        $variant = $this->makeVariant();
        $token = $this->addToCart($variant->id)->json('cart_token');
        Cart::query()->update(['expires_at' => now()->subMinute()]);

        $this->withHeaders(['X-Cart-Token' => $token])->getJson('/api/v1/cart')->assertJsonPath('data.item_count', 0);
        $this->checkout($token)->assertNotFound();
    }

    public function test_adding_more_than_stock_or_unavailable_items_is_refused(): void
    {
        $variant = $this->makeVariant(stock: 2);
        $this->addToCart($variant->id, 3)->assertStatus(422)->assertJsonPath('message', 'Only 2 left in stock.');
        $this->addToCart($this->makeVariant(stock: 0)->id)->assertStatus(422)->assertJsonPath('message', 'This item is out of stock.');
        $this->addToCart(999999)->assertStatus(422)->assertJsonPath('message', 'This item is not available.');
        $this->addToCart($variant->id, 0)->assertStatus(422);
        $this->addToCart($variant->id, 21)->assertStatus(422);
    }

    public function test_price_changes_and_stock_problems_are_reported_in_the_cart(): void
    {
        $variant = $this->makeVariant('1000.00', stock: 5);
        $token = $this->addToCart($variant->id, 4)->json('cart_token');

        $variant->update(['price' => '1100.00']);
        Inventory::query()->where('variant_id', $variant->id)->update(['quantity' => 2]);

        $this->withHeaders(['X-Cart-Token' => $token])->getJson('/api/v1/cart')->assertOk()
            ->assertJsonPath('data.items.0.unit_price', '1100.00')
            ->assertJsonPath('data.items.0.previous_unit_price', '1000.00')
            ->assertJsonPath('data.items.0.issue', 'insufficient_stock')
            ->assertJsonPath('data.can_checkout', false);

        $variant->product->update(['status' => 'draft']);
        $this->withHeaders(['X-Cart-Token' => $token])->getJson('/api/v1/cart')
            ->assertJsonPath('data.items.0.issue', 'unavailable')->assertJsonPath('data.subtotal', '0.00');
    }

    public function test_guest_cod_checkout_creates_order_reserves_stock_and_clears_cart(): void
    {
        $variant = $this->makeVariant('1000.00', stock: 5);
        $token = $this->addToCart($variant->id, 2)->json('cart_token');

        $res = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])->checkout($token)->assertCreated()
            ->assertJsonPath('data.totals.subtotal', '2000.00')
            ->assertJsonPath('data.totals.shipping', '70.00')
            ->assertJsonPath('data.totals.total', '2070.00')
            ->assertJsonPath('data.status.code', 'pending')
            ->assertJsonPath('data.payment.method', 'cod')
            ->assertJsonPath('replayed', false);

        $order = Order::query()->where('order_number', $res->json('data.order_number'))->firstOrFail();
        $this->assertSame(OrderStatus::Pending, $order->status);
        $this->assertSame('203.0.113.7', $order->ip_address);
        $this->assertSame('Mirpur', $order->ship_upazila_name);
        $this->assertTrue($order->accessTokenMatches($res->json('access_token')));
        $this->assertStringNotContainsString('ip_address', $res->getContent());
        $this->assertStringNotContainsString('checkout_key', $res->getContent());

        $this->assertSame(2, Inventory::query()->where('variant_id', $variant->id)->value('reserved_quantity'));
        $this->assertSame(1, InventoryReservation::query()->where('status', ReservationStatus::Active)->count());
        $this->withHeaders(['X-Cart-Token' => $token])->getJson('/api/v1/cart')->assertJsonPath('data.item_count', 0);
    }

    public function test_client_prices_are_ignored_and_changed_totals_need_reconfirmation(): void
    {
        $variant = $this->makeVariant('1000.00');
        $token = $this->addToCart($variant->id)->json('cart_token');

        // Extra price fields from the client are not part of the contract and change nothing.
        $this->checkout($token, overrides: ['unit_price' => '1.00', 'grand_total' => '1.00', 'expected_total' => '1.00'])
            ->assertStatus(409)->assertJsonPath('code', 'total_changed')->assertJsonPath('total', '1070.00');
        $this->assertSame(0, Order::query()->count());

        $this->checkout($token, overrides: ['expected_total' => '1070.00'])->assertCreated()
            ->assertJsonPath('data.totals.total', '1070.00');
    }

    public function test_duplicate_submission_returns_the_same_order(): void
    {
        $variant = $this->makeVariant(stock: 5);
        $token = $this->addToCart($variant->id, 2)->json('cart_token');

        $first = $this->checkout($token, 'same-key-1234567890')->assertCreated();
        $second = $this->checkout($token, 'same-key-1234567890')->assertOk()->assertJsonPath('replayed', true);

        $this->assertSame($first->json('data.order_number'), $second->json('data.order_number'));
        $this->assertSame($first->json('access_token'), $second->json('access_token'));
        $this->assertSame(1, Order::query()->count());
        $this->assertSame(2, Inventory::query()->where('variant_id', $variant->id)->value('reserved_quantity'));

        // A new key on the now-empty cart cannot create a second order either.
        $this->checkout($token, 'other-key-123456789')->assertStatus(422)->assertJsonPath('message', 'Your cart is empty.');
    }

    public function test_checkout_requires_idempotency_key_and_valid_details(): void
    {
        $variant = $this->makeVariant();
        $token = $this->addToCart($variant->id)->json('cart_token');

        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', $this->checkoutBody())->assertStatus(400);

        $this->checkout($token, overrides: ['customer_phone' => '12345', 'accept_terms' => false, 'area_name' => null, 'payment_method' => 'bkash'])
            ->assertStatus(422)
            ->assertJsonPath('errors.customer_phone.0', 'Please enter a valid Bangladeshi mobile number, for example 01712345678.')
            ->assertJsonPath('errors.accept_terms.0', 'Please confirm that your order details are correct.')
            ->assertJsonPath('errors.area_name.0', 'Please enter your area, upazila or thana.')
            ->assertJsonPath('errors.payment_method.0', 'This payment method is not available.');
        $this->assertSame(0, Order::query()->count());
    }

    public function test_last_unit_cannot_be_sold_twice(): void
    {
        $variant = $this->makeVariant(stock: 1);
        $tokenA = $this->addToCart($variant->id)->json('cart_token');
        $tokenB = $this->addToCart($variant->id)->json('cart_token');

        $this->checkout($tokenA, 'buyer-a-key-0000001')->assertCreated();
        $this->checkout($tokenB, 'buyer-b-key-0000001', ['customer_phone' => '01812345678'])->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_starts_with($m, 'Not enough stock'));

        $inv = Inventory::query()->where('variant_id', $variant->id)->first();
        $this->assertSame(1, $inv->quantity);
        $this->assertSame(1, $inv->reserved_quantity);
        $this->assertSame(1, Order::query()->count());
    }

    public function test_coupon_is_validated_on_the_server(): void
    {
        Coupon::query()->create(['code' => 'WINTER10', 'type' => CouponType::Percent, 'value' => '10',
            'min_order_amount' => '0', 'per_user_limit' => 1, 'is_active' => true]);
        $variant = $this->makeVariant('1000.00');
        $token = $this->addToCart($variant->id)->json('cart_token');

        $this->withHeaders(['X-Cart-Token' => $token])->getJson("/api/v1/cart?district_id={$this->dhaka}&coupon_code=nope")
            ->assertJsonPath('data.coupon.applied', false)->assertJsonPath('data.quote.discount', '0.00');
        $this->withHeaders(['X-Cart-Token' => $token])->getJson("/api/v1/cart?district_id={$this->dhaka}&coupon_code=winter10")
            ->assertJsonPath('data.coupon.applied', true)->assertJsonPath('data.quote.total', '970.00');

        $this->checkout($token, overrides: ['coupon_code' => 'winter10'])->assertCreated()
            ->assertJsonPath('data.totals.discount', '100.00');

        $token2 = $this->addToCart($variant->id)->assertCreated()->json('cart_token');
        $this->checkout($token2, 'second-coupon-key-01', ['coupon_code' => 'WINTER10'])->assertStatus(422)
            ->assertJsonPath('message', 'This coupon has already been used with this phone number.');
    }

    public function test_order_access_by_token_and_masked_lookup_by_phone(): void
    {
        $variant = $this->makeVariant();
        $token = $this->addToCart($variant->id)->json('cart_token');
        $res = $this->checkout($token)->assertCreated();
        $number = $res->json('data.order_number');

        $this->withHeaders(['X-Order-Token' => $res->json('access_token')])->getJson("/api/v1/orders/{$number}")
            ->assertOk()->assertJsonPath('data.customer.phone', '01712345678')
            ->assertJsonPath('data.shipping_address.address_line', 'House 12, Road 5');
        $this->withHeaders(['X-Order-Token' => str_repeat('0', 64)])->getJson("/api/v1/orders/{$number}")
            ->assertNotFound()->assertJsonPath('message', 'We could not find an order with these details.');
        $this->getJson("/api/v1/orders/{$number}")->assertNotFound();

        $this->postJson('/api/v1/orders/lookup', ['order_number' => strtolower($number), 'phone' => '+880 1712-345678'])
            ->assertOk()->assertJsonPath('data.customer.phone', '017*****678')
            ->assertJsonPath('data.customer.name', 'Rakib ***')
            ->assertJsonPath('data.shipping_address.address_line', null);
        $this->postJson('/api/v1/orders/lookup', ['order_number' => $number, 'phone' => '01812345678'])
            ->assertNotFound()->assertJsonPath('message', 'We could not find an order with these details.');
        $this->postJson('/api/v1/orders/lookup', ['order_number' => 'CX-2026-999999', 'phone' => '01712345678'])->assertNotFound();
    }

    public function test_order_lookup_and_checkout_are_rate_limited(): void
    {
        config(['cartix.rate_limits.order_lookup' => 3, 'cartix.rate_limits.checkout' => 2]);
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/orders/lookup', ['order_number' => 'CX-2026-000001', 'phone' => '01712345678'])->assertNotFound();
        }
        $this->postJson('/api/v1/orders/lookup', ['order_number' => 'CX-2026-000001', 'phone' => '01712345678'])
            ->assertStatus(429)->assertJsonPath('message', 'Too many lookup attempts. Please wait a minute and try again.');

        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/v1/checkout', [])->assertStatus(400);
        }
        $this->postJson('/api/v1/checkout', [])->assertStatus(429);
    }

    public function test_only_configured_payment_methods_are_offered(): void
    {
        $this->getJson('/api/v1/checkout/options')->assertOk()
            ->assertJsonCount(1, 'data.payment_methods')->assertJsonPath('data.payment_methods.0.label', 'Cash on delivery');
        $this->assertTrue(ProductVariant::query()->doesntExist());
    }
}
