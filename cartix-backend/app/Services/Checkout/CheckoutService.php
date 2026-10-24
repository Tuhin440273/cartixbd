<?php

namespace App\Services\Checkout;

use App\Enums\OrderPaymentStatus;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\ProductImageKind;
use App\Enums\ProductStatus;
use App\Enums\VendorOrderStatus;
use App\Enums\VendorStatus;
use App\Exceptions\DomainRuleException;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\District;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Models\Upazila;
use App\Models\VendorOrder;
use App\Services\InventoryService;
use App\Services\Pricing\CouponInput;
use App\Services\Pricing\CouponNotApplicable;
use App\Services\Pricing\OrderPricingService;
use App\Services\Pricing\PricingLine;
use App\Services\ShippingCalculator;
use App\Support\Money;
use App\Support\Phone;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Turns cart lines into an order. Prices are calculated on the server (client prices are never trusted);
 * vendor orders, price snapshots, stock reservations and coupon usage all happen in one transaction.
 *
 * quote() runs the same calculation without writing anything, for cart and checkout previews.
 */
final class CheckoutService
{
    /** Time allowed to finish an online payment before reserved stock is released. */
    public const ONLINE_PAYMENT_HOLD_MINUTES = 30;

    public const MAX_QUANTITY_PER_LINE = 20;

    public function __construct(
        private readonly OrderPricingService $pricing,
        private readonly InventoryService $inventory,
        private readonly ShippingCalculator $shipping,
    ) {}

    /**
     * Price a set of lines for a district without placing an order.
     *
     * @param  list<array{variant_id:int, quantity:int}>  $items
     */
    public function quote(array $items, int $districtId, ?string $couponCode = null, ?string $customerPhone = null): CheckoutQuote
    {
        $phone = $customerPhone !== null && Phone::isValid($customerPhone) ? Phone::normalize($customerPhone) : null;

        return $this->prepare($this->mergeLines($items), $districtId, $couponCode, $phone, lock: false);
    }

    public function place(CheckoutData $data): Order
    {
        if ($data->checkoutKey !== null && ($existing = $this->findByCheckoutKey($data->checkoutKey))) {
            return $existing;
        }

        $customerPhone = Phone::normalize($data->customerPhone);
        $recipientPhone = Phone::normalize($data->recipientPhone);
        $quantities = $this->mergeLines($data->items);

        try {
            return DB::transaction(fn () => $this->create($data, $customerPhone, $recipientPhone, $quantities));
        } catch (UniqueConstraintViolationException $e) {
            // Two identical submissions raced; the first one won. Return its order instead of a second one.
            if ($data->checkoutKey !== null && ($existing = $this->findByCheckoutKey($data->checkoutKey))) {
                return $existing;
            }
            throw $e;
        }
    }

    /** @param  array<int, int>  $quantities */
    private function create(CheckoutData $data, string $customerPhone, string $recipientPhone, array $quantities): Order
    {
        $quote = $this->prepare($quantities, $data->districtId, $data->couponCode, $customerPhone, lock: true);
        $district = $quote->district;
        $price = $quote->price;
        $coupon = $quote->coupon;

        $upazila = $data->upazilaId
            ? Upazila::query()->where('district_id', $district->id)->find($data->upazilaId)
            : null;
        if ($data->upazilaId && $upazila === null) {
            throw new DomainRuleException('The selected upazila does not belong to the selected district.');
        }

        $accessToken = $data->accessToken ?? bin2hex(random_bytes(24));
        $order = new Order([
            'order_number' => 'TMP-'.bin2hex(random_bytes(8)),
            'checkout_key' => $data->checkoutKey,
            'user_id' => $data->userId,
            'customer_name' => $data->customerName,
            'customer_phone' => $customerPhone,
            'customer_email' => $data->customerEmail,
            'ship_recipient_name' => $data->recipientName,
            'ship_phone' => $recipientPhone,
            'ship_division_name' => $district->division->name,
            'ship_district_id' => $district->id,
            'ship_district_name' => $district->name,
            'ship_upazila_name' => $upazila?->name ?? ($data->areaName !== null && trim($data->areaName) !== '' ? trim($data->areaName) : null),
            'ship_address_line' => $data->addressLine,
            'ship_postcode' => $data->postcode,
            'subtotal' => Money::toDecimal($price->subtotal),
            'discount_total' => Money::toDecimal($price->discountTotal),
            'shipping_total' => Money::toDecimal($price->shippingTotal),
            'shipping_discount' => Money::toDecimal($price->shippingDiscount),
            'grand_total' => Money::toDecimal($price->grandTotal),
            'payment_method' => $data->paymentMethod,
            'payment_status' => OrderPaymentStatus::Unpaid,
            'status' => OrderStatus::Pending,
            'coupon_id' => $coupon?->id,
            'customer_note' => $data->note,
            'ip_address' => $data->ipAddress,
        ]);
        $order->forceFill(['access_token_hash' => hash('sha256', $accessToken)])->save();
        $order->update(['order_number' => sprintf('CX-%s-%06d', now()->format('Y'), $order->id)]);
        $order->plainAccessToken = $accessToken;

        // One vendor order per vendor: CX-2026-000123-A, -B ...
        $vendorOrders = [];
        $letter = 'A';
        foreach ($price->vendors as $vendorId => $v) {
            $vendorOrders[$vendorId] = VendorOrder::query()->create([
                'order_id' => $order->id,
                'vendor_id' => $vendorId,
                'sub_number' => "{$order->order_number}-{$letter}",
                'subtotal' => Money::toDecimal($v['subtotal']),
                'discount' => Money::toDecimal($v['discount']),
                'shipping_fee' => Money::toDecimal($v['shipping_fee']),
                'shipping_discount' => Money::toDecimal($v['shipping_discount']),
                'commission_amount' => Money::toDecimal($v['commission']),
                'vendor_earning' => Money::toDecimal($v['vendor_earning']),
                'status' => VendorOrderStatus::Pending,
            ]);
            $letter++;
        }

        // Lines and snapshots; stock is reserved in variant id order to avoid deadlocks.
        $expiresAt = $data->paymentMethod === PaymentMethod::Cod ? null : now()->addMinutes(self::ONLINE_PAYMENT_HOLD_MINUTES);
        foreach ($quote->variants->sortBy('id') as $variant) {
            $product = $variant->product;
            $l = $price->lines[$variant->id];
            $item = OrderItem::query()->create([
                'order_id' => $order->id,
                'vendor_order_id' => $vendorOrders[$product->vendor_id]->id,
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'product_name' => $product->name,
                'variant_label' => $variant->label() ?: null,
                'sku' => $variant->sku,
                'product_image' => $this->snapshotImage($variant),
                'unit_price' => (string) $variant->price,
                // Cost snapshot for profit reports; null when no cost price is recorded.
                'unit_cost' => $variant->cost_price !== null ? (string) $variant->cost_price : null,
                'quantity' => $quote->quantities[$variant->id],
                'discount_amount' => Money::toDecimal($l['discount']),
                'platform_discount_amount' => Money::toDecimal($l['platform_discount']),
                'line_total' => Money::toDecimal($l['line_total']),
                'commission_rate' => $quote->commissionRateFor($variant->id),
            ]);
            $this->inventory->reserve($item, $expiresAt);
        }

        OrderStatusHistory::query()->create([
            'order_id' => $order->id,
            'from_status' => null,
            'to_status' => OrderStatus::Pending->value,
            'changed_by' => $data->userId,
            'note' => 'Order placed',
        ]);

        if ($coupon) {
            CouponUsage::query()->create([
                'coupon_id' => $coupon->id,
                'user_id' => $data->userId,
                'customer_phone' => $customerPhone,
                'order_id' => $order->id,
                'discount_amount' => Money::toDecimal($price->couponDiscount()),
            ]);
        }

        return $order->load('vendorOrders', 'items');
    }

    /** @param  array<int, int>  $quantities */
    private function prepare(array $quantities, int $districtId, ?string $couponCode, ?string $phone, bool $lock): CheckoutQuote
    {
        $variants = $this->loadSellableVariants(array_keys($quantities));
        $district = District::query()->with('division')->find($districtId);
        if ($district === null) {
            throw new DomainRuleException('Please choose a valid district.');
        }
        if (! $district->is_deliverable) {
            throw new DomainRuleException("Sorry, we do not deliver to {$district->name} yet.");
        }

        $defaultRate = (string) Setting::get('default_commission_rate', '0');
        $lines = [];
        $weightByVendor = [];
        foreach ($variants as $variant) {
            $product = $variant->product;
            $qty = $quantities[$variant->id];
            $rate = $product->vendor->commission_rate ?? $product->category->commission_rate ?? $defaultRate;
            $lines[] = new PricingLine($variant->id, $product->vendor_id, Money::toPoisha((string) $variant->price), $qty, (string) $rate);
            $weightByVendor[$product->vendor_id] = ($weightByVendor[$product->vendor_id] ?? 0) + ($variant->weight_grams ?? 500) * $qty;
        }

        $shippingFees = [];
        foreach ($weightByVendor as $vendorId => $grams) {
            $shippingFees[$vendorId] = $this->shipping->fee($district, $grams);
        }

        $coupon = ($couponCode !== null && trim($couponCode) !== '') ? $this->usableCoupon($couponCode, $phone, $lock) : null;

        try {
            $price = $this->pricing->calculate($lines, $shippingFees, $coupon ? CouponInput::fromModel($coupon) : null);
        } catch (CouponNotApplicable $e) {
            throw new DomainRuleException($e->getMessage(), 0, $e);
        }

        return new CheckoutQuote($variants, $quantities, $lines, $district, $coupon, $price);
    }

    private function findByCheckoutKey(string $key): ?Order
    {
        return Order::query()->where('checkout_key', $key)->with('vendorOrders', 'items')->first();
    }

    /**
     * @param  list<array{variant_id:int, quantity:int}>  $items
     * @return array<int, int> variant_id => total quantity
     */
    private function mergeLines(array $items): array
    {
        $out = [];
        foreach ($items as $item) {
            $id = (int) $item['variant_id'];
            $out[$id] = ($out[$id] ?? 0) + (int) $item['quantity'];
        }
        foreach ($out as $qty) {
            if ($qty < 1 || $qty > self::MAX_QUANTITY_PER_LINE) {
                throw new DomainRuleException('Each item quantity must be between 1 and '.self::MAX_QUANTITY_PER_LINE.'.');
            }
        }
        if ($out === []) {
            throw new DomainRuleException('Your cart is empty.');
        }

        return $out;
    }

    /** @param  list<int>  $ids */
    private function loadSellableVariants(array $ids): Collection
    {
        $variants = ProductVariant::query()
            ->with(['product.vendor', 'product.category', 'attributeValues', 'images', 'product.images'])
            ->whereIn('id', $ids)
            ->where('is_active', true)
            ->get();

        $sellable = $variants->filter(fn (ProductVariant $v) => $v->product !== null
            && $v->product->status === ProductStatus::Active
            && $v->product->vendor?->status === VendorStatus::Approved);

        if ($sellable->count() !== count($ids)) {
            throw new DomainRuleException('Some items in your cart are no longer available.');
        }

        return $sellable->values();
    }

    private function usableCoupon(string $code, ?string $phone, bool $lock): Coupon
    {
        $query = Coupon::query()->where('code', strtoupper(trim($code)));
        $coupon = $lock ? $query->lockForUpdate()->first() : $query->first();

        if ($coupon === null || ! $coupon->isLiveAt(now())) {
            throw new DomainRuleException('This coupon is not valid or has expired.');
        }
        if ($coupon->usage_limit !== null && $coupon->usages()->count() >= $coupon->usage_limit) {
            throw new DomainRuleException('This coupon has reached its usage limit.');
        }
        if ($phone !== null && $coupon->per_user_limit !== null
            && $coupon->usages()->where('customer_phone', $phone)->count() >= $coupon->per_user_limit) {
            throw new DomainRuleException('This coupon has already been used with this phone number.');
        }

        return $coupon;
    }

    private function snapshotImage(ProductVariant $variant): ?string
    {
        $image = $variant->images->where('kind', ProductImageKind::Gallery)->sortBy('sort_order')->first()
            ?? $variant->product->images->where('kind', ProductImageKind::Gallery)->sortBy('sort_order')->first();

        return $image?->path;
    }
}
