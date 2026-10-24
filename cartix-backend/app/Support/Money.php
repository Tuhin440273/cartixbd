<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Money is calculated in poisha (integers), never with floats.
 * Converts between DECIMAL(12,2) database values and poisha.
 */
final class Money
{
    /** "1250.50" or 1250.5 becomes 125050 poisha. */
    public static function toPoisha(string|int|float $amount): int
    {
        if (is_int($amount)) {
            return $amount * 100;
        }

        $str = is_float($amount) ? number_format($amount, 2, '.', '') : trim($amount);

        if (! preg_match('/^(-)?(\d+)(?:\.(\d{1,2}))?$/', $str, $m)) {
            throw new InvalidArgumentException("Invalid money amount: {$str}");
        }

        $value = ((int) $m[2]) * 100 + (int) str_pad($m[3] ?? '0', 2, '0');

        return $m[1] === '-' ? -$value : $value;
    }

    /** 125050 becomes "1250.50" (for DECIMAL columns). */
    public static function toDecimal(int $poisha): string
    {
        $sign = $poisha < 0 ? '-' : '';
        $abs = abs($poisha);

        return $sign.intdiv($abs, 100).'.'.str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }

    /** Poisha multiplied by a percentage with up to two decimals (e.g. 12.50%), rounded half-up. */
    public static function percentOf(int $poisha, string|int|float $percent): int
    {
        $basisPoints = self::toPoisha($percent); // 12.50% → 1250 basis points

        if ($poisha < 0 || $basisPoints < 0) {
            throw new InvalidArgumentException('Negative amount or percent');
        }

        return intdiv($poisha * $basisPoints + 5000, 10000);
    }
}
