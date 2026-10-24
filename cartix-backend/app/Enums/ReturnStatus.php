<?php

namespace App\Enums;

enum ReturnStatus: string
{
    use HasLabel;

    case Requested = 'requested';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Received = 'received';
    case Completed = 'completed';

    public function label(): string
    {
        return match ($this) {
            self::Requested => 'Requested',
            self::Approved => 'Approved',
            self::Rejected => 'Rejected',
            self::Received => 'Item received',
            self::Completed => 'Completed',
        };
    }
}
