<?php

namespace App\Enums;

enum Courier: string
{
    use HasLabel;

    case Steadfast = 'steadfast';
    case Pathao = 'pathao';
    case Redx = 'redx';
    case Manual = 'manual';

    public function label(): string
    {
        return match ($this) {
            self::Steadfast => 'Steadfast',
            self::Pathao => 'Pathao',
            self::Redx => 'RedX',
            self::Manual => 'Own delivery',
        };
    }
}
