<?php

namespace App\Enums;

enum ReturnResolution: string
{
    use HasLabel;

    case Refund = 'refund';
    case Exchange = 'exchange';

    public function label(): string
    {
        return match ($this) {
            self::Refund => 'Refund',
            self::Exchange => 'Exchange',
        };
    }
}
