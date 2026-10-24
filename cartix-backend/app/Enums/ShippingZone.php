<?php

namespace App\Enums;

enum ShippingZone: string
{
    use HasLabel;

    case InsideDhaka = 'inside_dhaka';
    case SubDhaka = 'sub_dhaka';
    case OutsideDhaka = 'outside_dhaka';

    public function label(): string
    {
        return match ($this) {
            self::InsideDhaka => 'Inside Dhaka',
            self::SubDhaka => 'Dhaka suburbs',
            self::OutsideDhaka => 'Outside Dhaka',
        };
    }
}
