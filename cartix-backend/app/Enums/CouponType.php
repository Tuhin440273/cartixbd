<?php

namespace App\Enums;

enum CouponType: string
{
    use HasLabel;

    case Percent = 'percent';
    case Fixed = 'fixed';
    case FreeShipping = 'free_shipping';

    public function label(): string
    {
        return match ($this) {
            self::Percent => 'Percentage',
            self::Fixed => 'Fixed amount',
            self::FreeShipping => 'Free delivery',
        };
    }
}
