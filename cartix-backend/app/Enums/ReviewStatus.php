<?php

namespace App\Enums;

enum ReviewStatus: string
{
    use HasLabel;

    case Pending = 'pending';
    case Approved = 'approved';
    case Hidden = 'hidden';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Approved => 'Approved',
            self::Hidden => 'Hidden',
        };
    }
}
