<?php

namespace App\Enums;

enum ReservationStatus: string
{
    use HasLabel;

    case Active = 'active';
    case Converted = 'converted';
    case Released = 'released';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Reserved',
            self::Converted => 'Sold',
            self::Released => 'Released',
        };
    }
}
