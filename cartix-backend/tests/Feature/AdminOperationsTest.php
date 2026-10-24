<?php

namespace Tests\Feature;

use App\Enums\CouponType;
use App\Enums\VendorOrderStatus;
use App\Exceptions\DomainRuleException;
use App\Models\ActivityLog;
use App\Models\Coupon;
use App\Models\District;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\ShippingRate;
use App\Models\User;
use App\Services\Checkout\CheckoutService;
use App\Services\OrderStatusService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Concerns\BuildsStore;
use Tests\TestCase;

class AdminOperationsTest extends TestCase
{
    use BuildsStore, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    private function actAsAdmin(): User
    {
        $admin = $this->admin();
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function staff(string $role, string $phone = '01822222222'): User
    {
        $user = User::query()->create(['name' => ucfirst($role), 'phone' => $phone, 'password' => 'staff-pass-123']);
        $user->assignRole($role);

        return $user;
    }

    public function test_dashboard_separates_sales_from_profit_and_counts_pending_and_low_stock(): void
    {
        $this->actAsAdmin();
        $variant = $this->makeVariant('1000.00', stock: 3);
        $variant->update(['cost_price' => '600.00']);
        $noCost = $this->makeVariant('500.00', stock: 10);

        app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));
        app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $noCost->id, 'quantity' => 1]], ['customerPhone' => '01812345678']));

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('kpis.today_orders', 2)
            // 2 x 1000 + 70 delivery, and 500 + 70 delivery
            ->assertJsonPath('kpis.today_sales', '2640.00')
            // Only the item with a cost price counts: 2 x (1000 - 600)
            ->assertJsonPath('kpis.today_gross_profit', '800.00')
            ->assertJsonPath('kpis.today_items_without_cost', 1)
            ->assertJsonPath('kpis.pending_orders', 2)
            // 3 - 2 reserved = 1 available, below the default threshold of 5
            ->assertJsonPath('kpis.low_stock_count', 1);
    }

    public function test_cost_price_is_snapshotted_at_checkout(): void
    {
        $variant = $this->makeVariant('1000.00');
        $variant->update(['cost_price' => '600.00']);
        $order = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        $variant->update(['cost_price' => '900.00']);

        $this->assertSame('600.00', $order->items->first()->fresh()->unit_cost);
    }

    public function test_sales_report_excludes_cancelled_and_returned_items_and_reports_delivered_profit(): void
    {
        $this->actAsAdmin();
        $status = app(OrderStatusService::class);
        $variant = $this->makeVariant('1000.00', stock: 20);
        $variant->update(['cost_price' => '600.00']);
        $place = fn (int $qty, string $phone) => app(CheckoutService::class)
            ->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => $qty]], ['customerPhone' => $phone]));

        $delivered = $place(1, '01711111111');
        $status->confirmOrder($delivered);
        $vo = $delivered->vendorOrders()->first();
        $status->transition($vo, VendorOrderStatus::Shipped);
        $status->transition($vo->fresh(), VendorOrderStatus::Delivered);

        $cancelled = $place(2, '01722222222');
        $status->cancelOrder($cancelled, null, 'Customer changed mind');

        $place(3, '01733333333'); // still pending

        $today = now('Asia/Dhaka')->toDateString();
        $res = $this->getJson("/api/admin/reports/sales?from={$today}&to={$today}")->assertOk()
            ->assertJsonPath('summary.orders', 3)
            ->assertJsonPath('summary.cancelled_orders', 1)
            ->assertJsonPath('summary.units_sold', 4)
            ->assertJsonPath('summary.product_sales', '4000.00')
            ->assertJsonPath('summary.cost_of_goods', '2400.00')
            ->assertJsonPath('summary.gross_profit', '1600.00')
            ->assertJsonPath('summary.delivered_profit', '400.00')
            ->assertJsonPath('top_products.0.units', 4);
        // Gross sales: (1000 + 70) + (3000 + 90, because 1.5 kg adds one extra kilogram); the cancelled order is excluded.
        $res->assertJsonPath('summary.gross_sales', '4160.00')->assertJsonPath('summary.delivery_charges', '160.00');
        $this->assertSame($today, $res->json('daily.0.date'));
        $this->assertSame('1600.00', $res->json('daily.0.gross_profit'));

        $this->getJson('/api/admin/reports/sales?from=2026-01-10&to=2026-01-01')->assertStatus(422)
            ->assertJsonPath('errors.to.0', 'The end date must be on or after the start date.');
    }

    public function test_customers_are_listed_from_orders_with_totals(): void
    {
        $this->actAsAdmin();
        $variant = $this->makeVariant('1000.00', stock: 20);
        $checkout = app(CheckoutService::class);
        $checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        $second = $checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));
        app(OrderStatusService::class)->cancelOrder($second, null, 'Duplicate');
        $checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]], ['customerPhone' => '01812345678', 'customerName' => 'Nusrat Jahan']));

        $this->getJson('/api/admin/customers?sort=orders')->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.phone', '01712345678')
            ->assertJsonPath('data.0.orders_count', 2)
            ->assertJsonPath('data.0.cancelled_count', 1)
            ->assertJsonPath('data.0.total_spent', '1070.00');
        $this->getJson('/api/admin/customers?q=nusrat')->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'Nusrat Jahan');
        $this->getJson('/api/admin/customers/+8801712345678')->assertOk()->assertJsonCount(2, 'data.orders')->assertJsonPath('data.total_spent', '1070.00');
        $this->getJson('/api/admin/customers/01999999999')->assertNotFound();
    }

    public function test_coupons_crud_and_used_coupons_are_kept(): void
    {
        $this->actAsAdmin();
        $res = $this->postJson('/api/admin/coupons', [
            'code' => 'eid10', 'type' => 'percent', 'value' => '10', 'max_discount' => '200', 'is_active' => true,
        ])->assertCreated()->assertJsonPath('data.code', 'EID10')->assertJsonPath('data.state', 'live');
        $this->postJson('/api/admin/coupons', ['code' => 'BAD', 'type' => 'percent', 'value' => '150', 'is_active' => true])
            ->assertStatus(422)->assertJsonPath('errors.value.0', 'A percentage cannot be more than 100.');

        $variant = $this->makeVariant('1000.00');
        app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]], ['couponCode' => 'EID10']));
        $id = $res->json('data.id');
        $this->getJson('/api/admin/coupons')->assertJsonPath('data.0.times_used', 1)->assertJsonPath('data.0.discount_given', '100.00');
        $this->deleteJson("/api/admin/coupons/{$id}")->assertStatus(422);
        $this->putJson("/api/admin/coupons/{$id}", ['code' => 'EID10', 'type' => 'percent', 'value' => '10', 'is_active' => false])
            ->assertOk()->assertJsonPath('data.state', 'inactive');
        $this->assertFalse(Coupon::query()->findOrFail($id)->is_active);
        $this->assertSame(CouponType::Percent, Coupon::query()->findOrFail($id)->type);

        // An end date alone (no start date) is valid; times are entered in Dhaka time.
        $this->postJson('/api/admin/coupons', [
            'code' => 'FREEDEL', 'type' => 'free_shipping', 'ends_at' => '2030-01-31T23:59', 'is_active' => true,
        ])->assertCreated()->assertJsonPath('data.ends_at', '2030-01-31T17:59:00+00:00')->assertJsonPath('data.value', '0.00');
    }

    public function test_delivery_coverage_and_rates_control_checkout(): void
    {
        $this->actAsAdmin();
        $dhaka = District::query()->where('name', 'Dhaka')->firstOrFail();
        $others = District::query()->whereKeyNot($dhaka->id)->pluck('id')->all();

        // Dhaka pilot: close every other district.
        $this->postJson('/api/admin/shipping/districts/bulk', ['district_ids' => $others, 'is_deliverable' => false])->assertOk();
        $this->assertSame(1, District::query()->where('is_deliverable', true)->count());

        // The last open district cannot be closed.
        $this->putJson("/api/admin/shipping/districts/{$dhaka->id}", ['is_deliverable' => false, 'shipping_zone' => 'inside_dhaka'])
            ->assertStatus(422)->assertJsonPath('message', 'At least one district must stay open for delivery, or customers cannot order.');

        $this->getJson('/api/v1/locations/divisions')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.districts.0.name', 'Dhaka');

        $variant = $this->makeVariant('1000.00');
        $chittagong = District::query()->where('name', 'Chattogram')->value('id') ?? $others[0];
        $this->expectsDomainRule(fn () => app(CheckoutService::class)->place(
            $this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]], ['districtId' => $chittagong])
        ), 'Sorry, we do not deliver to');

        $this->putJson('/api/admin/shipping/rates/inside_dhaka', [
            'base_fee' => '60', 'per_kg_fee' => '15', 'min_days' => 1, 'max_days' => 2, 'is_active' => true,
        ])->assertOk()->assertJsonPath('rates.0.base_fee', '60.00')->assertJsonPath('rates.0.deliverable_districts', 1);
        $this->putJson('/api/admin/shipping/rates/inside_dhaka', [
            'base_fee' => '60', 'per_kg_fee' => '15', 'min_days' => 3, 'max_days' => 2, 'is_active' => true,
        ])->assertStatus(422);
        $this->putJson('/api/admin/shipping/rates/moon', ['base_fee' => '1'])->assertNotFound();

        $order = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        $this->assertSame('60.00', $order->shipping_total);
        $this->assertSame('60.00', ShippingRate::query()->where('zone', 'inside_dhaka')->value('base_fee'));
    }

    private function expectsDomainRule(callable $fn, string $startsWith): void
    {
        try {
            $fn();
            $this->fail('Expected a business rule error.');
        } catch (DomainRuleException $e) {
            $this->assertStringStartsWith($startsWith, $e->getMessage());
        }
    }

    public function test_staff_management_is_super_admin_only_and_blocking_ends_sessions(): void
    {
        $super = $this->actAsAdmin();

        $res = $this->postJson('/api/admin/staff', [
            'name' => 'Order Desk', 'phone' => '+880 1911-111111', 'role' => 'order_manager', 'password' => 'short',
        ])->assertStatus(422);
        $this->assertArrayHasKey('password', $res->json('errors'));

        $id = $this->postJson('/api/admin/staff', [
            'name' => 'Order Desk', 'phone' => '+880 1911-111111', 'role' => 'order_manager', 'password' => 'desk-password-1',
        ])->assertCreated()->assertJsonPath('data.phone', '01911111111')->json('data.id');
        $this->postJson('/api/admin/staff', [
            'name' => 'Dup', 'phone' => '01911111111', 'role' => 'admin', 'password' => 'desk-password-1',
        ])->assertStatus(422)->assertJsonPath('message', 'An account with this phone number already exists.');

        // The new staff member signs in, then gets blocked: the token stops working at once.
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/admin/login', ['phone' => '01911111111', 'password' => 'desk-password-1'])->assertOk()->json('token');
        Sanctum::actingAs($super);
        $this->putJson("/api/admin/staff/{$id}", ['name' => 'Order Desk', 'role' => 'order_manager', 'status' => 'blocked'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/admin/me')->assertUnauthorized();

        // Safety rules.
        Sanctum::actingAs($super);
        $this->putJson("/api/admin/staff/{$super->id}", ['name' => $super->name, 'role' => 'admin', 'status' => 'active'])
            ->assertStatus(422)->assertJsonPath('message', 'You cannot change your own role or block yourself.');

        $this->putJson("/api/admin/staff/{$id}/password", ['password' => 'new-desk-password-2'])->assertOk();
        $this->assertTrue(ActivityLog::query()->where('action', 'staff.password_reset')->exists());

        $admin = $this->staff('admin', '01733333333');
        Sanctum::actingAs($admin);
        $this->getJson('/api/admin/staff')->assertForbidden();
    }

    public function test_last_super_admin_cannot_be_demoted(): void
    {
        $super = $this->admin();
        $other = $this->staff('super_admin', '01744444444');
        Sanctum::actingAs($other);

        $this->putJson("/api/admin/staff/{$super->id}", ['name' => $super->name, 'role' => 'admin', 'status' => 'active'])->assertOk();
        Sanctum::actingAs($super->fresh());
        // $super is no longer a super admin, so the staff page is closed to them.
        $this->getJson('/api/admin/staff')->assertForbidden();

        Sanctum::actingAs($other);
        $this->putJson("/api/admin/staff/{$other->id}", ['name' => $other->name, 'role' => 'admin', 'status' => 'active'])
            ->assertStatus(422);
        $this->assertTrue($other->fresh()->hasRole('super_admin'));
    }

    public function test_activity_log_records_admin_actions_with_ip_address(): void
    {
        $this->actAsAdmin();
        $variant = $this->makeVariant();
        $order = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.4'])
            ->postJson("/api/admin/orders/{$order->id}/confirm", ['note' => 'Called customer'])->assertOk();

        $this->getJson('/api/admin/activity?action=order.')->assertOk()
            ->assertJsonPath('data.0.action', 'order.confirmed')
            ->assertJsonPath('data.0.ip_address', '198.51.100.4')
            ->assertJsonPath('data.0.properties.order_number', $order->order_number);

        Sanctum::actingAs($this->staff('order_manager'));
        $this->getJson('/api/admin/activity')->assertForbidden();
        $this->getJson('/api/admin/reports/sales')->assertForbidden();
        $this->getJson('/api/admin/shipping')->assertForbidden();
        $this->getJson('/api/admin/customers')->assertOk();
    }

    public function test_customer_to_admin_workflow_from_storefront_checkout_to_delivery_and_cancellation(): void
    {
        $variant = $this->makeVariant('1000.00', stock: 5);
        $token = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 2])->assertCreated()->json('cart_token');
        $this->flushHeaders();
        $number = $this->withHeaders(['X-Cart-Token' => $token, 'Idempotency-Key' => 'workflow-key-000000001'])
            ->postJson('/api/v1/checkout', [
                'customer_name' => 'Rakib Hasan', 'customer_phone' => '01712345678',
                'district_id' => District::query()->where('name', 'Dhaka')->value('id'),
                'area_name' => 'Mirpur', 'address_line' => 'House 12, Road 5', 'payment_method' => 'cod', 'accept_terms' => true,
            ])->assertCreated()->json('data.order_number');
        $this->flushHeaders();

        $this->actAsAdmin();
        $list = $this->getJson('/api/admin/orders?status=pending')->assertOk();
        $this->assertSame($number, $list->json('data.0.order_number'));
        $this->getJson('/api/admin/orders?q=+880 1712-345678')->assertJsonPath('data.0.order_number', $number);
        $orderId = $list->json('data.0.id');

        $this->postJson("/api/admin/orders/{$orderId}/confirm")->assertOk()->assertJsonPath('data.status', 'confirmed');
        $voId = Order::query()->findOrFail($orderId)->vendorOrders()->value('id');
        $this->postJson("/api/admin/vendor-orders/{$voId}/status", ['status' => 'delivered'])->assertStatus(422);
        $this->postJson("/api/admin/vendor-orders/{$voId}/status", ['status' => 'shipped'])->assertOk();
        $this->assertSame(3, Inventory::query()->where('variant_id', $variant->id)->value('quantity'));
        $this->assertSame(0, Inventory::query()->where('variant_id', $variant->id)->value('reserved_quantity'));
        $this->postJson("/api/admin/vendor-orders/{$voId}/status", ['status' => 'delivered'])->assertOk();

        $history = $this->getJson("/api/admin/orders/{$orderId}")->json('data.history');
        // Newest first: shipment steps (with a sub-order) and the parent order status they lead to.
        $this->assertSame(['completed', 'delivered', 'processing', 'shipped', 'confirmed', 'confirmed', 'pending'], array_column($history, 'to'));
        $this->assertSame(['delivered', 'shipped', 'confirmed'], array_column(array_filter($history, fn ($h) => $h['sub_order'] !== null), 'to'));

        // A second order that is cancelled gives its reserved stock back.
        $second = app(CheckoutService::class)->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));
        $this->assertSame(2, Inventory::query()->where('variant_id', $variant->id)->value('reserved_quantity'));
        $this->postJson("/api/admin/orders/{$second->id}/cancel", ['note' => 'Customer did not answer'])->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(0, Inventory::query()->where('variant_id', $variant->id)->value('reserved_quantity'));
        $this->postJson("/api/admin/orders/{$second->id}/cancel", ['note' => 'Again'])->assertStatus(422);
    }
}
