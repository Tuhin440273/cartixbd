<?php

namespace App\Services\Pricing;

use App\Enums\CouponType;
use App\Models\Coupon;
use App\Support\Money;

final class CouponInput
{
    public function __construct(
        public readonly CouponType $type,
        /** Percent for percentage coupons, poisha for fixed coupons. */
        public readonly int|string $value,
        public readonly ?int $maxDiscount = null,
        public readonly int $minOrderAmount = 0,
        /** NULL = funded by Cartix, otherwise funded by that vendor. */
        public readonly ?int $vendorId = null,
    ) {}

    public static function fromModel(Coupon $coupon): self
    {
        return new self(
            type: $coupon->type,
            value: $coupon->type === CouponType::Percent ? (string) $coupon->value : Money::toPoisha((string) $coupon->value),
            maxDiscount: $coupon->max_discount !== null ? Money::toPoisha((string) $coupon->max_discount) : null,
            minOrderAmount: Money::toPoisha((string) $coupon->min_order_amount),
            vendorId: $coupon->vendor_id,
        );
    }

    public function isPlatformFunded(): bool
    {
        return $this->vendorId === null;
    }
}
