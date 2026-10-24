<?php

namespace App\Enums;

enum VendorStatus: string
{
    use HasLabel;

    case Pending = 'pending';
    case Approved = 'approved';
    case Suspended = 'suspended';
    case Rejected = 'rejected';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Approved => 'Approved',
            self::Suspended => 'Suspended',
            self::Rejected => 'Rejected',
        };
    }
}
