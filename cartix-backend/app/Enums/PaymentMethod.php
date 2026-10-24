<?php

namespace App\Enums;

enum PaymentMethod: string
{
    use HasLabel;

    case Cod = 'cod';
    case Bkash = 'bkash';
    case Nagad = 'nagad';
    case Sslcommerz = 'sslcommerz';

    public function label(): string
    {
        return match ($this) {
            self::Cod => 'Cash on delivery',
            self::Bkash => 'bKash',
            self::Nagad => 'Nagad',
            self::Sslcommerz => 'Card / SSLCommerz',
        };
    }
}
