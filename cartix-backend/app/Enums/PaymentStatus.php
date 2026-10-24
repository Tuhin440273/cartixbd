<?php

namespace App\Enums;

enum PaymentStatus: string
{
    use HasLabel;

    case Initiated = 'initiated';
    case Success = 'success';
    case Failed = 'failed';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Initiated => 'Initiated',
            self::Success => 'Successful',
            self::Failed => 'Failed',
            self::Cancelled => 'Cancelled',
        };
    }
}
