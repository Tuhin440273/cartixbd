<?php

namespace App\Services\Pricing;

use InvalidArgumentException;

/** One order line; amounts are in poisha. */
final class PricingLine
{
    public function __construct(
        public readonly string|int $key,
        public readonly int $vendorId,
        public readonly int $unitPrice,
        public readonly int $quantity,
        /** Commission rate in percent, e.g. "10.00". */
        public readonly string $commissionRate = '0',
    ) {
        if ($quantity < 1) {
            throw new InvalidArgumentException('Quantity must be at least 1');
        }
        if ($unitPrice < 0) {
            throw new InvalidArgumentException('Unit price cannot be negative');
        }
        if (! is_numeric($commissionRate) || (float) $commissionRate < 0 || (float) $commissionRate > 100) {
            throw new InvalidArgumentException('Commission rate must be between 0 and 100');
        }
    }

    public function gross(): int
    {
        return $this->unitPrice * $this->quantity;
    }
}
