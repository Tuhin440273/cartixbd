<?php

namespace App\Enums;

enum VendorTransactionType: string
{
    use HasLabel;

    case SaleCredit = 'sale_credit';
    case CommissionDebit = 'commission_debit';
    case RefundDebit = 'refund_debit';
    case PayoutDebit = 'payout_debit';
    case Adjustment = 'adjustment';

    public function label(): string
    {
        return match ($this) {
            self::SaleCredit => 'Sale credit',
            self::CommissionDebit => 'Commission',
            self::RefundDebit => 'Refund',
            self::PayoutDebit => 'Payout',
            self::Adjustment => 'Adjustment',
        };
    }
}
