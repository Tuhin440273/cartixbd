<?php

namespace Tests\Unit;

use App\Enums\CouponType;
use App\Services\Pricing\CouponInput;
use App\Services\Pricing\CouponNotApplicable;
use App\Services\Pricing\OrderPricingService;
use App\Services\Pricing\PricingLine;
use App\Services\Pricing\PricingResult;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Verifies every formula from the "money rules" section of the design document.
 * All amounts are in poisha: 125000 = BDT 1,250.00
 */
class OrderPricingServiceTest extends TestCase
{
    private const CARTIX = 1;

    private const SELLER = 2;

    private OrderPricingService $svc;

    protected function setUp(): void
    {
        $this->svc = new OrderPricingService;
    }

    public function test_single_vendor_without_coupon(): void
    {
        $r = $this->svc->calculate([
            new PricingLine('hoodie', self::CARTIX, 125000, 2),
            new PricingLine('shirt', self::CARTIX, 89000, 1),
        ], [self::CARTIX => 6000]);

        $this->assertSame(339000, $r->subtotal);
        $this->assertSame(0, $r->discountTotal);
        $this->assertSame(6000, $r->shippingTotal);
        $this->assertSame(345000, $r->grandTotal);
        $this->assertSame(250000, $r->lines['hoodie']['line_total']);
        $this->assertSame(339000, $r->vendors[self::CARTIX]['vendor_earning']);
        $this->assertInvariants($r);
    }

    public function test_platform_percent_coupon_is_split_by_price_and_does_not_cut_vendor_earning(): void
    {
        $r = $this->svc->calculate([
            new PricingLine('a', self::SELLER, 100000, 1, '10'),
            new PricingLine('b', self::SELLER, 50000, 1, '10'),
        ], [self::SELLER => 6000], new CouponInput(CouponType::Percent, '10'));

        // 10% of BDT 1,500 = BDT 150, split by price as 100 : 50
        $this->assertSame(10000, $r->lines['a']['discount']);
        $this->assertSame(5000, $r->lines['b']['discount']);
        $this->assertSame(10000, $r->lines['a']['platform_discount']);
        // Cartix-funded coupon: commission is on the full price and the vendor's earning is unchanged
        $this->assertSame(15000, $r->vendors[self::SELLER]['commission']);
        $this->assertSame(150000 - 15000, $r->vendors[self::SELLER]['vendor_earning']);
        $this->assertSame(150000 - 15000 + 6000, $r->grandTotal);
        $this->assertInvariants($r);
    }

    public function test_vendor_coupon_only_touches_that_vendor_and_vendor_pays_for_it(): void
    {
        $r = $this->svc->calculate([
            new PricingLine('cartix-hoodie', self::CARTIX, 125000, 1, '0'),
            new PricingLine('seller-kurti', self::SELLER, 100000, 1, '10'),
        ], [self::CARTIX => 6000, self::SELLER => 6000], new CouponInput(CouponType::Fixed, 20000, vendorId: self::SELLER));

        $this->assertSame(0, $r->lines['cartix-hoodie']['discount']);
        $this->assertSame(20000, $r->lines['seller-kurti']['discount']);
        $this->assertSame(0, $r->lines['seller-kurti']['platform_discount']);
        // Commission on the discounted price: (1000 - 200) x 10% = 80
        $this->assertSame(8000, $r->vendors[self::SELLER]['commission']);
        $this->assertSame(100000 - 20000 - 8000, $r->vendors[self::SELLER]['vendor_earning']);
        $this->assertInvariants($r);
    }

    public function test_free_shipping_goes_to_shipping_discount_not_item_discount(): void
    {
        $r = $this->svc->calculate([
            new PricingLine('x', self::CARTIX, 50000, 1),
        ], [self::CARTIX => 13000], new CouponInput(CouponType::FreeShipping, 0));

        $this->assertSame(0, $r->discountTotal);
        $this->assertSame(13000, $r->shippingTotal);
        $this->assertSame(13000, $r->shippingDiscount);
        $this->assertSame(50000, $r->grandTotal);
        $this->assertSame(13000, $r->couponDiscount());
        $this->assertInvariants($r);
    }

    public function test_percent_coupon_respects_max_discount(): void
    {
        $r = $this->svc->calculate([
            new PricingLine('x', self::CARTIX, 500000, 1),
        ], [], new CouponInput(CouponType::Percent, '20', maxDiscount: 30000));

        $this->assertSame(30000, $r->discountTotal);
        $this->assertInvariants($r);
    }

    public function test_fixed_coupon_never_exceeds_the_eligible_amount(): void
    {
        $r = $this->svc->calculate([
            new PricingLine('x', self::CARTIX, 20000, 1),
        ], [self::CARTIX => 6000], new CouponInput(CouponType::Fixed, 50000));

        $this->assertSame(20000, $r->discountTotal);
        $this->assertSame(6000, $r->grandTotal);
        $this->assertInvariants($r);
    }

    public function test_coupon_below_minimum_order_is_rejected(): void
    {
        $this->expectException(CouponNotApplicable::class);
        $this->svc->calculate([new PricingLine('x', self::CARTIX, 40000, 1)], [],
            new CouponInput(CouponType::Fixed, 5000, minOrderAmount: 50000));
    }

    public function test_vendor_coupon_without_that_vendors_items_is_rejected(): void
    {
        $this->expectException(CouponNotApplicable::class);
        $this->svc->calculate([new PricingLine('x', self::CARTIX, 40000, 1)], [],
            new CouponInput(CouponType::Fixed, 5000, vendorId: self::SELLER));
    }

    public function test_rounding_leftover_poisha_is_not_lost(): void
    {
        // BDT 100 discount over three equal lines: 3333 + 3333 + 3334 = 10000
        $r = $this->svc->calculate([
            new PricingLine('a', self::CARTIX, 30000, 1),
            new PricingLine('b', self::CARTIX, 30000, 1),
            new PricingLine('c', self::CARTIX, 30000, 1),
        ], [], new CouponInput(CouponType::Fixed, 10000));

        $shares = array_column($r->lines, 'discount');
        $this->assertSame(10000, array_sum($shares));
        $this->assertEqualsCanonicalizing([3333, 3333, 3334], $shares);
        $this->assertInvariants($r);
    }

    public function test_commission_is_rounded_half_up_per_line(): void
    {
        // BDT 199.99 x 12.5% = 24.99875, rounded to 25.00
        $r = $this->svc->calculate([new PricingLine('x', self::SELLER, 19999, 1, '12.5')], []);
        $this->assertSame(2500, $r->vendors[self::SELLER]['commission']);
    }

    /** @return array<string, array{int, list<int>}> */
    public static function allocationCases(): array
    {
        return [
            'even' => [10, [3, 3, 3, 3]],
            'uneven weights' => [997, [125000, 89000, 45000, 1]],
            'full amount' => [259001, [125000, 89000, 45000, 1]],
            'tiny total' => [1, [5, 5, 5]],
            'zero' => [0, [10, 20]],
        ];
    }

    /** @param list<int> $weights */
    #[DataProvider('allocationCases')]
    public function test_allocation_sums_exactly_and_never_exceeds_a_line(int $total, array $weights): void
    {
        $shares = OrderPricingService::allocate($total, $weights);

        $this->assertSame($total, array_sum($shares));
        foreach ($shares as $i => $share) {
            $this->assertGreaterThanOrEqual(0, $share);
            $this->assertLessThanOrEqual($weights[$i], $share);
        }
    }

    public function test_allocation_refuses_more_than_the_lines_are_worth(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        OrderPricingService::allocate(100, [1, 1, 1, 1]);
    }

    public function test_random_orders_always_balance(): void
    {
        mt_srand(20261023);
        for ($n = 0; $n < 300; $n++) {
            $lines = [];
            $fees = [];
            for ($i = 0; $i < mt_rand(1, 6); $i++) {
                $vendor = mt_rand(1, 3);
                $lines[] = new PricingLine("l{$i}", $vendor, mt_rand(1, 500000), mt_rand(1, 5), (string) (mt_rand(0, 2000) / 100));
                $fees[$vendor] = mt_rand(0, 20000);
            }
            $coupon = match (mt_rand(0, 3)) {
                0 => null,
                1 => new CouponInput(CouponType::Percent, (string) mt_rand(1, 50)),
                2 => new CouponInput(CouponType::Fixed, mt_rand(1, 100000), vendorId: mt_rand(0, 1) ? null : $lines[0]->vendorId),
                3 => new CouponInput(CouponType::FreeShipping, 0),
            };

            $this->assertInvariants($this->svc->calculate($lines, $fees, $coupon));
        }
    }

    /** The documented formulas must hold for every result. */
    private function assertInvariants(PricingResult $r): void
    {
        foreach ($r->lines as $l) {
            $this->assertSame($l['gross'] - $l['discount'], $l['line_total']);
            $this->assertGreaterThanOrEqual(0, $l['line_total']);
            $this->assertLessThanOrEqual($l['discount'], $l['platform_discount']);
        }
        $this->assertSame(array_sum(array_column($r->vendors, 'subtotal')), $r->subtotal);
        $this->assertSame(array_sum(array_column($r->vendors, 'discount')), $r->discountTotal);
        // No discount is subtracted twice: the sum of line discounts equals the order discount
        $this->assertSame(array_sum(array_column($r->lines, 'discount')), $r->discountTotal);
        $this->assertSame(
            $r->subtotal - $r->discountTotal + $r->shippingTotal - $r->shippingDiscount,
            $r->grandTotal,
        );
        foreach ($r->vendors as $v) {
            $this->assertLessThanOrEqual($v['shipping_fee'], $v['shipping_discount']);
        }
    }
}
