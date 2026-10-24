<?php

namespace App\Services\Pricing;

use App\Enums\CouponType;
use App\Support\Money;
use InvalidArgumentException;

/**
 * All order money calculations in one place (the "money rules" in the design document).
 *
 *  order_items   line_total = unit_price × quantity − discount_amount
 *  vendor_orders subtotal = Σ gross, discount = Σ discount,
 *                commission = Σ round((gross − vendor_discount) × rate%),
 *                vendor_earning = subtotal − Σ vendor_discount − commission
 *  orders        grand_total = subtotal − discount_total + shipping_total − shipping_discount
 *
 * Discounts are counted once, on the lines; higher levels are only sums.
 */
final class OrderPricingService
{
    /** Maximum of BDT 10 million per order; above that, integer multiplication could overflow. */
    private const MAX_POISHA = 1_000_000_000;

    /**
     * @param  list<PricingLine>  $lines
     * @param  array<int, int>  $shippingFees  vendor_id => delivery charge (poisha)
     */
    public function calculate(array $lines, array $shippingFees = [], ?CouponInput $coupon = null): PricingResult
    {
        if ($lines === []) {
            throw new InvalidArgumentException('An order needs at least one line');
        }

        $keys = [];
        foreach ($lines as $line) {
            if (isset($keys[$line->key])) {
                throw new InvalidArgumentException("Duplicate line key: {$line->key}");
            }
            $keys[$line->key] = true;
        }

        $vendorIds = array_values(array_unique(array_map(fn (PricingLine $l) => $l->vendorId, $lines)));
        $subtotal = array_sum(array_map(fn (PricingLine $l) => $l->gross(), $lines));
        if ($subtotal > self::MAX_POISHA) {
            throw new InvalidArgumentException('Order total is above the supported limit');
        }

        // 1. How much coupon discount each line gets
        $lineDiscounts = array_fill_keys(array_keys($keys), 0);
        $shippingDiscounts = [];

        if ($coupon !== null) {
            $eligible = array_values(array_filter(
                $lines,
                fn (PricingLine $l) => $coupon->vendorId === null || $l->vendorId === $coupon->vendorId,
            ));
            $eligibleGross = array_sum(array_map(fn (PricingLine $l) => $l->gross(), $eligible));

            if ($eligible === []) {
                throw new CouponNotApplicable('This coupon does not apply to any item in your order.');
            }
            if ($eligibleGross < $coupon->minOrderAmount) {
                throw new CouponNotApplicable('Your order total is below the minimum required for this coupon.');
            }

            if ($coupon->type === CouponType::FreeShipping) {
                foreach ($vendorIds as $vendorId) {
                    if ($coupon->vendorId === null || $coupon->vendorId === $vendorId) {
                        $shippingDiscounts[$vendorId] = $shippingFees[$vendorId] ?? 0;
                    }
                }
            } else {
                $total = $this->couponAmount($coupon, $eligibleGross);
                $shares = self::allocate($total, array_map(fn (PricingLine $l) => $l->gross(), $eligible));
                foreach ($eligible as $i => $line) {
                    $lineDiscounts[$line->key] = $shares[$i];
                }
            }
        }

        // 2. Lines
        $lineResults = [];
        foreach ($lines as $line) {
            $gross = $line->gross();
            $discount = $lineDiscounts[$line->key];
            $platformDiscount = ($coupon !== null && $coupon->isPlatformFunded()) ? $discount : 0;
            $vendorDiscount = $discount - $platformDiscount;

            $lineResults[$line->key] = [
                'gross' => $gross,
                'discount' => $discount,
                'platform_discount' => $platformDiscount,
                'line_total' => $gross - $discount,
                'commission' => Money::percentOf($gross - $vendorDiscount, $line->commissionRate),
            ];
        }

        // 3. Vendor orders
        $vendorResults = [];
        foreach ($vendorIds as $vendorId) {
            $vendorLines = array_filter($lines, fn (PricingLine $l) => $l->vendorId === $vendorId);
            $sub = 0;
            $disc = 0;
            $vendorDisc = 0;
            $commission = 0;
            foreach ($vendorLines as $line) {
                $r = $lineResults[$line->key];
                $sub += $r['gross'];
                $disc += $r['discount'];
                $vendorDisc += $r['discount'] - $r['platform_discount'];
                $commission += $r['commission'];
            }

            $vendorResults[$vendorId] = [
                'subtotal' => $sub,
                'discount' => $disc,
                'shipping_fee' => $shippingFees[$vendorId] ?? 0,
                'shipping_discount' => $shippingDiscounts[$vendorId] ?? 0,
                'commission' => $commission,
                'vendor_earning' => $sub - $vendorDisc - $commission,
            ];
        }

        // 4. The whole order: sums only
        $discountTotal = array_sum(array_column($vendorResults, 'discount'));
        $shippingTotal = array_sum(array_column($vendorResults, 'shipping_fee'));
        $shippingDiscount = array_sum(array_column($vendorResults, 'shipping_discount'));

        return new PricingResult(
            lines: $lineResults,
            vendors: $vendorResults,
            subtotal: $subtotal,
            discountTotal: $discountTotal,
            shippingTotal: $shippingTotal,
            shippingDiscount: $shippingDiscount,
            grandTotal: $subtotal - $discountTotal + $shippingTotal - $shippingDiscount,
        );
    }

    private function couponAmount(CouponInput $coupon, int $eligibleGross): int
    {
        $amount = match ($coupon->type) {
            CouponType::Percent => Money::percentOf($eligibleGross, (string) $coupon->value),
            CouponType::Fixed => (int) $coupon->value,
            CouponType::FreeShipping => 0,
        };

        if ($coupon->maxDiscount !== null) {
            $amount = min($amount, $coupon->maxDiscount);
        }

        return max(0, min($amount, $eligibleGross));
    }

    /**
     * Split a total across weights using the largest remainder method.
     * The shares sum exactly to $total and no share exceeds its own weight (when $total <= sum of weights).
     *
     * @param  list<int>  $weights
     * @return list<int>
     */
    public static function allocate(int $total, array $weights): array
    {
        $sum = array_sum($weights);
        if ($total < 0 || $sum <= 0 || $total > $sum) {
            throw new InvalidArgumentException('Cannot allocate this amount');
        }

        $shares = [];
        $remainders = [];
        foreach ($weights as $i => $w) {
            $shares[$i] = intdiv($total * $w, $sum);
            $remainders[$i] = ($total * $w) % $sum;
        }

        $left = $total - array_sum($shares);
        // Largest remainder first; ties go to the earlier line, so the result is deterministic.
        $order = array_keys($weights);
        usort($order, fn ($a, $b) => [$remainders[$b], $a] <=> [$remainders[$a], $b]);
        for ($k = 0; $k < $left; $k++) {
            $shares[$order[$k]]++;
        }

        return array_values($shares);
    }
}
