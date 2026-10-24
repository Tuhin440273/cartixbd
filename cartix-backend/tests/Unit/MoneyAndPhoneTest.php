<?php

namespace Tests\Unit;

use App\Support\Money;
use App\Support\Phone;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class MoneyAndPhoneTest extends TestCase
{
    public function test_money_round_trips_without_float_errors(): void
    {
        $this->assertSame(125050, Money::toPoisha('1250.50'));
        $this->assertSame(125005, Money::toPoisha('1250.05'));
        $this->assertSame(10, Money::toPoisha('0.1'));
        $this->assertSame(-990, Money::toPoisha('-9.90'));
        $this->assertSame(30, Money::toPoisha(0.1 + 0.2));
        $this->assertSame('1250.05', Money::toDecimal(125005));
        $this->assertSame('-0.05', Money::toDecimal(-5));
        $this->assertSame('0.00', Money::toDecimal(0));
    }

    public function test_money_rejects_garbage(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Money::toPoisha('12.345');
    }

    /** @return array<string, array{string}> */
    public static function samePhoneNumber(): array
    {
        return [
            'local' => ['01712345678'],
            'spaces and dash' => ['01712-345 678'],
            'country code plus' => ['+8801712345678'],
            'country code' => ['8801712345678'],
            'missing zero' => ['1712345678'],
            'bengali-script digits' => [self::bengaliDigits('01712345678')],
        ];
    }

    #[DataProvider('samePhoneNumber')]
    public function test_phone_formats_become_one_number(string $raw): void
    {
        $this->assertSame('01712345678', Phone::normalize($raw));
    }

    /** Builds the same number written in Bengali-script digits (U+09E6..U+09EF) without literal non-ASCII text. */
    private static function bengaliDigits(string $ascii): string
    {
        return implode('', array_map(fn (string $d) => mb_chr(0x09E6 + (int) $d, 'UTF-8'), str_split($ascii)));
    }

    public function test_invalid_phone_is_rejected(): void
    {
        $this->assertFalse(Phone::isValid('01212345678')); // there is no 012 operator
        $this->assertFalse(Phone::isValid('0171234567'));  // one digit short
        $this->assertFalse(Phone::isValid('hello'));
    }
}
