<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Normalizes Bangladeshi mobile numbers to one format (01XXXXXXXXX).
 * "+880 1712-345678", "8801712345678" and "01712 345678" all become the same number,
 * so coupon limits and guest order checks treat one person as one person.
 */
final class Phone
{
    public static function normalize(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', self::toAsciiDigits($raw)) ?? '';

        if (str_starts_with($digits, '880')) {
            $digits = substr($digits, 2);
        } elseif (str_starts_with($digits, '1') && strlen($digits) === 10) {
            $digits = '0'.$digits;
        }

        if (! preg_match('/^01[3-9]\d{8}$/', $digits)) {
            throw new InvalidArgumentException("Invalid Bangladeshi mobile number: {$raw}");
        }

        return $digits;
    }

    public static function isValid(string $raw): bool
    {
        try {
            self::normalize($raw);

            return true;
        } catch (InvalidArgumentException) {
            return false;
        }
    }

    /** Converts Bengali-script digits (U+09E6..U+09EF) to ASCII digits. */
    private static function toAsciiDigits(string $value): string
    {
        static $map = null;
        if ($map === null) {
            $map = [];
            for ($d = 0; $d <= 9; $d++) {
                $map[mb_chr(0x09E6 + $d, 'UTF-8')] = (string) $d;
            }
        }

        return strtr($value, $map);
    }
}
