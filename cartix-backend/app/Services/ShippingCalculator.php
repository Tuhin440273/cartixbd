<?php

namespace App\Services;

use App\Exceptions\DomainRuleException;
use App\Models\District;
use App\Models\ShippingRate;
use App\Support\Money;

final class ShippingCalculator
{
    /** Delivery charge in poisha: the zone base fee plus per_kg_fee for every kg after the first. */
    public function fee(District $district, int $weightGrams): int
    {
        $rate = ShippingRate::query()
            ->where('zone', $district->shipping_zone)
            ->where('is_active', true)
            ->first();

        if ($rate === null) {
            throw new DomainRuleException('Delivery is not available in this district yet.');
        }

        $extraKg = (int) ceil(max(0, $weightGrams - 1000) / 1000);

        return Money::toPoisha((string) $rate->base_fee) + $extraKg * Money::toPoisha((string) $rate->per_kg_fee);
    }
}
