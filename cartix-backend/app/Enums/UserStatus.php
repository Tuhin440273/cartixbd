<?php

namespace App\Enums;

enum UserStatus: string
{
    use HasLabel;

    case Active = 'active';
    case Blocked = 'blocked';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Blocked => 'Blocked',
        };
    }
}
