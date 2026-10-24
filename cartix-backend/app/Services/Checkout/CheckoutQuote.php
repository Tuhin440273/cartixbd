<?php

namespace App\Services\Checkout;

use App\Models\Coupon;
use App\Models\District;
use App\Models\ProductVariant;
use App\Services\Pricing\PricingLine;
use App\Services\Pricing\PricingResult;
use Illuminate\Support\Collection;

/** Server-side price calculation for a set of cart lines, before anything is written. */
final class CheckoutQuote
{
    /**
     * @param  Collection<int, ProductVariant>  $variants
     * @param  array<int, int>  $quantities  variant_id => quantity
     * @param  list<PricingLine>  $lines
     */
    public function __construct(
        public readonly Collection $variants,
        public readonly array $quantities,
        public readonly array $lines,
        public readonly District $district,
        public readonly ?Coupon $coupon,
        public readonly PricingResult $price,
    ) {}

    public function commissionRateFor(int $variantId): string
    {
        foreach ($this->lines as $line) {
            if ($line->key === $variantId) {
                return $line->commissionRate;
            }
        }

        throw new \LogicException("No pricing line for variant {$variantId}");
    }
}
