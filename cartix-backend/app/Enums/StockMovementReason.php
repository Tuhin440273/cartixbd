<?php

namespace App\Enums;

enum StockMovementReason: string
{
    use HasLabel;

    case Purchase = 'purchase';
    case Sale = 'sale';
    case Cancel = 'cancel';
    case Return = 'return';
    case Adjustment = 'adjustment';

    public function label(): string
    {
        return match ($this) {
            self::Purchase => 'Purchase',
            self::Sale => 'Sale',
            self::Cancel => 'Cancellation',
            self::Return => 'Return',
            self::Adjustment => 'Adjustment',
        };
    }
}
