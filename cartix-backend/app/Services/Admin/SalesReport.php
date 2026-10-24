<?php

namespace App\Services\Admin;

use App\Enums\OrderStatus;
use App\Enums\VendorOrderStatus;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Sales and profit for a period. All sums are done by MySQL on DECIMAL columns, so they are exact.
 *
 * - Gross sales: what customers ordered (order totals including delivery), cancelled orders excluded.
 * - Product sales: item totals after discounts, cancelled and returned items excluded.
 * - Cost of goods: the cost price saved on each order item at checkout.
 * - Gross profit: product sales minus cost of goods, counted only for items that have a cost price.
 *   Items without a cost price are reported separately, so profit is never guessed.
 * Delivery charges are not profit: they are passed on to the courier.
 */
final class SalesReport
{
    /** Bangladesh has a fixed UTC+6 offset (no daylight saving). */
    private const OFFSET = '+06:00';

    /** @return array<string, mixed> */
    public function summary(CarbonInterface $fromUtc, CarbonInterface $toUtc): array
    {
        $orders = DB::table('orders')->whereBetween('created_at', [$fromUtc, $toUtc])
            ->selectRaw('count(*) as orders')
            ->selectRaw('sum(case when status = ? then 1 else 0 end) as cancelled', [OrderStatus::Cancelled->value])
            ->selectRaw('coalesce(sum(case when status <> ? then grand_total else 0 end), 0) as gross_sales', [OrderStatus::Cancelled->value])
            ->selectRaw('coalesce(sum(case when status <> ? then discount_total else 0 end), 0) as discounts', [OrderStatus::Cancelled->value])
            ->selectRaw('coalesce(sum(case when status <> ? then shipping_total - shipping_discount else 0 end), 0) as delivery_charges', [OrderStatus::Cancelled->value])
            ->first();

        $items = $this->items($fromUtc, $toUtc)
            ->selectRaw('coalesce(sum(order_items.quantity), 0) as units')
            ->selectRaw('coalesce(sum(order_items.line_total), 0) as product_sales')
            ->selectRaw('coalesce(sum(case when order_items.unit_cost is not null then order_items.line_total else 0 end), 0) as costed_sales')
            ->selectRaw('coalesce(sum(order_items.unit_cost * order_items.quantity), 0) as cost_of_goods')
            ->selectRaw('sum(case when order_items.unit_cost is null then 1 else 0 end) as items_without_cost')
            ->selectRaw('coalesce(sum(case when order_items.unit_cost is null then order_items.line_total else 0 end), 0) as sales_without_cost')
            ->selectRaw('coalesce(sum(case when vendor_orders.status = ? and order_items.unit_cost is not null then order_items.line_total - order_items.unit_cost * order_items.quantity else 0 end), 0) as delivered_profit', [VendorOrderStatus::Delivered->value])
            ->first();

        return [
            'orders' => (int) $orders->orders,
            'cancelled_orders' => (int) $orders->cancelled,
            'gross_sales' => self::money($orders->gross_sales),
            'discounts' => self::money($orders->discounts),
            'delivery_charges' => self::money($orders->delivery_charges),
            'units_sold' => (int) $items->units,
            'product_sales' => self::money($items->product_sales),
            'cost_of_goods' => self::money($items->cost_of_goods),
            'gross_profit' => Money::toDecimal(self::poisha($items->costed_sales) - self::poisha($items->cost_of_goods)),
            'delivered_profit' => self::money($items->delivered_profit),
            'items_without_cost' => (int) $items->items_without_cost,
            'sales_without_cost' => self::money($items->sales_without_cost),
        ];
    }

    /** @return list<array<string, mixed>> one row per Dhaka calendar day */
    public function daily(CarbonInterface $fromUtc, CarbonInterface $toUtc): array
    {
        $day = "date(convert_tz(orders.created_at, '+00:00', '".self::OFFSET."'))";
        $orders = DB::table('orders')->whereBetween('created_at', [$fromUtc, $toUtc])
            ->selectRaw("{$day} as day, count(*) as orders")
            ->selectRaw('coalesce(sum(case when status <> ? then grand_total else 0 end), 0) as gross_sales', [OrderStatus::Cancelled->value])
            ->groupByRaw($day)->get()->keyBy('day');
        $profit = $this->items($fromUtc, $toUtc)->whereNotNull('order_items.unit_cost')
            ->selectRaw("{$day} as day, coalesce(sum(order_items.line_total - order_items.unit_cost * order_items.quantity), 0) as profit")
            ->groupByRaw($day)->get()->keyBy('day');

        $rows = [];
        $cursor = $fromUtc->copy()->setTimezone('Asia/Dhaka')->startOfDay();
        $end = $toUtc->copy()->setTimezone('Asia/Dhaka');
        for (; $cursor <= $end; $cursor->addDay()) {
            $key = $cursor->toDateString();
            $rows[] = [
                'date' => $key,
                'orders' => (int) ($orders[$key]->orders ?? 0),
                'gross_sales' => self::money($orders[$key]->gross_sales ?? 0),
                'gross_profit' => self::money($profit[$key]->profit ?? 0),
            ];
        }

        return $rows;
    }

    /** @return list<array<string, mixed>> */
    public function topProducts(CarbonInterface $fromUtc, CarbonInterface $toUtc, int $limit = 10): array
    {
        return $this->items($fromUtc, $toUtc)
            ->selectRaw('order_items.product_id, max(order_items.product_name) as name, sum(order_items.quantity) as units, sum(order_items.line_total) as sales')
            ->groupBy('order_items.product_id')->orderByDesc('units')->orderByDesc('sales')->limit($limit)->get()
            ->map(fn ($r) => ['product_id' => (int) $r->product_id, 'name' => $r->name, 'units' => (int) $r->units, 'sales' => self::money($r->sales)])
            ->all();
    }

    /** Items of orders placed in the period, without cancelled or returned items. */
    private function items(CarbonInterface $fromUtc, CarbonInterface $toUtc): Builder
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('vendor_orders', 'vendor_orders.id', '=', 'order_items.vendor_order_id')
            ->whereBetween('orders.created_at', [$fromUtc, $toUtc])
            ->whereNotIn('vendor_orders.status', [VendorOrderStatus::Cancelled->value, VendorOrderStatus::Returned->value]);
    }

    /** MySQL returns DECIMAL sums as strings; they are converted without floating point. */
    private static function poisha(mixed $value): int
    {
        return Money::toPoisha($value === null ? '0' : (string) $value);
    }

    private static function money(mixed $value): string
    {
        return Money::toDecimal(self::poisha($value));
    }
}
