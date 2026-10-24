<?php

namespace App\Services\Pricing;

/**
 * All amounts are in poisha.
 *
 * @phpstan-type LineResult array{gross:int, discount:int, platform_discount:int, line_total:int, commission:int}
 * @phpstan-type VendorResult array{subtotal:int, discount:int, shipping_fee:int, shipping_discount:int, commission:int, vendor_earning:int}
 */
final class PricingResult
{
    /**
     * @param  array<string|int, LineResult>  $lines
     * @param  array<int, VendorResult>  $vendors
     */
    public function __construct(
        public readonly array $lines,
        public readonly array $vendors,
        public readonly int $subtotal,
        public readonly int $discountTotal,
        public readonly int $shippingTotal,
        public readonly int $shippingDiscount,
        public readonly int $grandTotal,
    ) {}

    public function couponDiscount(): int
    {
        return $this->discountTotal + $this->shippingDiscount;
    }
}
