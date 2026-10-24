<?php

namespace App\Enums;

enum PayoutMethod: string
{
    use HasLabel;

    case Bkash = 'bkash';
    case Nagad = 'nagad';
    case Bank = 'bank';

    public function label(): string
    {
        return match ($this) {
            self::Bkash => 'bKash',
            self::Nagad => 'Nagad',
            self::Bank => 'Bank transfer',
        };
    }
}
