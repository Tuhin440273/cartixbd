<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/** The shop works in Bangladesh time; the database stores UTC. */
final class ShopTime
{
    public const TZ = 'Asia/Dhaka';

    /** Parses a date-time typed in the admin panel (Dhaka time) into UTC. */
    public static function fromInput(?string $value): ?Carbon
    {
        return $value === null || $value === '' ? null : Carbon::parse($value, self::TZ)->utc();
    }

    public static function iso(?\DateTimeInterface $value): ?string
    {
        return $value === null ? null : Carbon::instance($value)->toIso8601String();
    }
}
