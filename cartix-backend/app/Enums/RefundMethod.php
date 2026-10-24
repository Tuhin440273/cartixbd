<?php

namespace App\Enums;

enum RefundMethod: string
{
    use HasLabel;

    case Bkash = 'bkash';
    case Nagad = 'nagad';
    case Bank = 'bank';
    case Original = 'original';

    public function label(): string
    {
        return match ($this) {
            self::Bkash => 'bKash',
            self::Nagad => 'Nagad',
            self::Bank => 'Bank transfer',
            self::Original => 'Original payment method',
        };
    }
}
