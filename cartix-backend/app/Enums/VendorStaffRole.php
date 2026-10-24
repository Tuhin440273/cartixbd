<?php

namespace App\Enums;

enum VendorStaffRole: string
{
    use HasLabel;

    case Manager = 'manager';
    case Staff = 'staff';

    public function label(): string
    {
        return match ($this) {
            self::Manager => 'Manager',
            self::Staff => 'Staff',
        };
    }
}
