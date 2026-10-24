<?php

namespace App\Enums;

enum ProductStatus: string
{
    use HasLabel;

    case Draft = 'draft';
    case PendingReview = 'pending_review';
    case Active = 'active';
    case Rejected = 'rejected';
    case Archived = 'archived';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::PendingReview => 'Pending review',
            self::Active => 'Active',
            self::Rejected => 'Rejected',
            self::Archived => 'Archived',
        };
    }
}
