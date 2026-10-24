<?php

namespace Tests\Feature;

use App\Enums\CouponType;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\ReservationStatus;
use App\Enums\VendorOrderStatus;
use App\Enums\VendorTransactionType;
use App\Exceptions\DomainRuleException;
use App\Models\Coupon;
use App\Models\Inventory;
use App\Models\InventoryReservation;
use App\Models\Order;
use App\Models\StockMovement;
use App\Models\VendorTransaction;
use App\Services\Checkout\CheckoutService;
use App\Services\InventoryService;
use App\Services\OrderStatusService;
use App\Services\VendorLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsStore;
use Tests\TestCase;

class OrderLifecycleTest extends TestCase
{
    use BuildsStore, RefreshDatabase;

    private CheckoutService $checkout;

    private OrderStatusService $status;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        $this->checkout = app(CheckoutService::class);
        $this->status = app(OrderStatusService::class);
    }

    public function test_checkout_creates_order_with_snapshot_reservation_and_server_side_prices(): void
    {
        $variant = $this->makeVariant('1250.00', stock: 10);

        $order = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));

        $this->assertMatchesRegularExpression('/^CX-\d{4}-\d{6}$/', $order->order_number);
        $this->assertSame(OrderStatus::Pending, $order->status);
        $this->assertSame('2500.00', $order->subtotal);
        $this->assertSame('70.00', $order->shipping_total); // inside Dhaka
        $this->assertSame('2570.00', $order->grand_total);
        $this->assertSame('Dhaka', $order->ship_district_name);
        $this->assertSame('Dhaka', $order->ship_division_name);

        $vo = $order->vendorOrders->first();
        $this->assertSame("{$order->order_number}-A", $vo->sub_number);

        $item = $order->items->first();
        $this->assertStringStartsWith('Test Hoodie', $item->product_name);
        $this->assertSame('2500.00', $item->line_total);

        $inv = Inventory::query()->where('variant_id', $variant->id)->first();
        $this->assertSame(10, $inv->quantity);
        $this->assertSame(2, $inv->reserved_quantity);
        $this->assertSame(ReservationStatus::Active, $item->reservation->status);
        $this->assertNull($item->reservation->expires_at); // COD reservations do not expire
    }

    public function test_price_change_after_order_does_not_change_the_order(): void
    {
        $variant = $this->makeVariant('890.00');
        $order = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));

        $variant->update(['price' => '990.00']);

        $this->assertSame('890.00', $order->items()->first()->unit_price);
        $this->assertSame('890.00', $order->fresh()->subtotal);
    }

    public function test_not_enough_stock_rolls_back_everything(): void
    {
        $variant = $this->makeVariant(stock: 1);

        try {
            $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));
            $this->fail('Expected stock error');
        } catch (DomainRuleException $e) {
            $this->assertStringContainsString('Not enough stock', $e->getMessage());
        }

        $this->assertSame(0, Order::query()->count());
        $this->assertSame(0, Inventory::query()->where('variant_id', $variant->id)->value('reserved_quantity'));
    }

    public function test_confirm_then_ship_moves_stock_with_before_and_after(): void
    {
        $variant = $this->makeVariant(stock: 10);
        $order = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 3]]));

        $this->status->confirmOrder($order, $this->admin(), 'Called customer');
        $this->assertSame(OrderStatus::Confirmed, $order->fresh()->status);
        $this->assertNotNull($order->fresh()->confirmed_at);

        $this->status->transition($order->vendorOrders()->first(), VendorOrderStatus::Shipped, $this->admin());

        $inv = Inventory::query()->where('variant_id', $variant->id)->first();
        $this->assertSame(7, $inv->quantity);
        $this->assertSame(0, $inv->reserved_quantity);

        $sale = StockMovement::query()->where('variant_id', $variant->id)->where('reason', 'sale')->first();
        $this->assertSame(-3, $sale->change);
        $this->assertSame(10, $sale->quantity_before);
        $this->assertSame(7, $sale->quantity_after);
        $this->assertSame(OrderStatus::Processing, $order->fresh()->status);
    }

    public function test_cancel_releases_reserved_stock_and_cannot_be_released_twice(): void
    {
        $variant = $this->makeVariant(stock: 5);
        $order = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 2]]));

        $this->status->cancelOrder($order, $this->admin(), 'Customer did not answer');

        $inv = Inventory::query()->where('variant_id', $variant->id)->first();
        $this->assertSame(5, $inv->quantity);
        $this->assertSame(0, $inv->reserved_quantity);
        $this->assertSame(OrderStatus::Cancelled, $order->fresh()->status);

        // Releasing again changes nothing
        app(InventoryService::class)->release(InventoryReservation::query()->firstOrFail());
        $this->assertSame(0, $inv->fresh()->reserved_quantity);
    }

    public function test_shipped_order_cannot_be_cancelled(): void
    {
        $variant = $this->makeVariant();
        $order = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        $vo = $order->vendorOrders()->first();
        $this->status->transition($vo, VendorOrderStatus::Confirmed);
        $this->status->transition($vo, VendorOrderStatus::Shipped);

        $this->expectException(DomainRuleException::class);
        $this->status->transition($vo, VendorOrderStatus::Cancelled);
    }

    public function test_two_vendors_split_into_sub_orders_and_ledger_follows_delivery_and_return(): void
    {
        $seller = $this->makeSeller('10.00');
        $own = $this->makeVariant('1000.00');
        $theirs = $this->makeVariant('2000.00', vendorId: $seller->id);

        $order = $this->checkout->place($this->checkoutData([
            ['variant_id' => $own->id, 'quantity' => 1],
            ['variant_id' => $theirs->id, 'quantity' => 1],
        ]));

        $this->assertCount(2, $order->vendorOrders);
        $this->assertSame('140.00', $order->shipping_total); // two shops, two parcels

        $sellerVo = $order->vendorOrders->firstWhere('vendor_id', $seller->id);
        $this->assertSame('200.00', $sellerVo->commission_amount);
        $this->assertSame('1800.00', $sellerVo->vendor_earning);

        foreach ([VendorOrderStatus::Confirmed, VendorOrderStatus::Shipped, VendorOrderStatus::Delivered] as $step) {
            $this->status->transition($sellerVo, $step, $this->admin());
        }

        $ledger = app(VendorLedgerService::class);
        $this->assertSame(180000, $ledger->balance($seller->id));
        $credit = VendorTransaction::query()->where('vendor_id', $seller->id)->where('type', VendorTransactionType::SaleCredit)->first();
        $this->assertSame('2000.00', $credit->amount);
        $this->assertTrue($credit->available_at->greaterThan(now()->addDays(6)));
        $this->assertSame(OrderStatus::Processing, $order->fresh()->status); // the Cartix part is still open

        $this->status->transition($sellerVo, VendorOrderStatus::Returned, $this->admin());
        $this->assertSame(0, $ledger->balance($seller->id));
        $this->assertSame(10, Inventory::query()->where('variant_id', $theirs->id)->value('quantity'));
    }

    public function test_ledger_rows_cannot_be_edited(): void
    {
        $seller = $this->makeSeller();
        app(VendorLedgerService::class)->post($seller->id, VendorTransactionType::Adjustment, 5000);

        $this->expectException(\LogicException::class);
        VendorTransaction::query()->firstOrFail()->update(['amount' => '999.00']);
    }

    public function test_coupon_per_phone_limit_counts_differently_written_numbers_as_one(): void
    {
        Coupon::query()->create([
            'code' => 'WINTER10', 'type' => CouponType::Percent, 'value' => '10', 'min_order_amount' => '0',
            'per_user_limit' => 1, 'is_active' => true,
        ]);
        $variant = $this->makeVariant('1000.00');

        $first = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]], ['couponCode' => 'winter10']));
        $this->assertSame('100.00', $first->discount_total);
        $this->assertSame('100.00', $first->items->first()->platform_discount_amount);

        $this->expectException(DomainRuleException::class);
        $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]], [
            'couponCode' => 'WINTER10', 'customerPhone' => '+880 1712-345678',
        ]));
    }

    public function test_online_payment_reservation_expires_and_is_released(): void
    {
        $variant = $this->makeVariant(stock: 3);
        $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 3]], ['paymentMethod' => PaymentMethod::Bkash]));

        $this->assertSame(0, Inventory::query()->where('variant_id', $variant->id)->first()->available());

        $this->travel(CheckoutService::ONLINE_PAYMENT_HOLD_MINUTES + 1)->minutes();
        $this->assertSame(1, app(InventoryService::class)->releaseExpired());
        $this->assertSame(3, Inventory::query()->where('variant_id', $variant->id)->first()->available());
    }

    public function test_guest_checkout_has_no_user_and_inactive_products_cannot_be_bought(): void
    {
        $variant = $this->makeVariant();
        $order = $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
        $this->assertNull($order->user_id);

        $variant->product->update(['status' => 'archived']);
        $this->expectException(DomainRuleException::class);
        $this->checkout->place($this->checkoutData([['variant_id' => $variant->id, 'quantity' => 1]]));
    }
}
