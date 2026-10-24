<?php

namespace App\Http\Controllers\Admin;

use App\Enums\OrderStatus;
use App\Enums\VendorOrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\VendorOrder;
use App\Services\Admin\SalesReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /** "Today" follows the shop time zone; timestamps are stored in UTC. */
    private const TZ = 'Asia/Dhaka';

    public function __invoke(SalesReport $report): JsonResponse
    {
        $now = Carbon::now(self::TZ);
        $todayStart = $now->copy()->startOfDay()->utc();
        $yesterdayStart = $now->copy()->subDay()->startOfDay()->utc();

        $todayOrders = Order::query()->where('created_at', '>=', $todayStart)->count();
        $yesterdayOrders = Order::query()->whereBetween('created_at', [$yesterdayStart, $todayStart])->count();

        // 30-day return rate: returned vendor orders out of all shipped ones
        $since = $now->copy()->subDays(30)->utc();
        $shipped = VendorOrder::query()->where('created_at', '>=', $since)
            ->whereIn('status', [VendorOrderStatus::Shipped, VendorOrderStatus::Delivered, VendorOrderStatus::Returned])->count();
        $returned = VendorOrder::query()->where('created_at', '>=', $since)->where('status', VendorOrderStatus::Returned)->count();

        // Orders per day for the last 7 days (Dhaka time)
        $start = $now->copy()->subDays(6)->startOfDay();
        $rows = Order::query()
            ->where('created_at', '>=', $start->copy()->utc())
            ->get(['created_at'])
            ->groupBy(fn (Order $o) => $o->created_at->copy()->setTimezone(self::TZ)->toDateString())
            ->map->count();
        $series = [];
        for ($d = 0; $d < 7; $d++) {
            $day = $start->copy()->addDays($d);
            $series[] = ['date' => $day->toDateString(), 'orders' => (int) ($rows[$day->toDateString()] ?? 0)];
        }

        $pipeline = VendorOrder::query()->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status');

        // Low stock counts only variants that can be sold: active variants of products that are not deleted.
        $lowStockQuery = Inventory::query()
            ->whereHas('variant', fn ($v) => $v->where('is_active', true)->whereHas('product'))
            ->whereRaw('quantity - reserved_quantity <= low_stock_threshold');
        $lowStock = (clone $lowStockQuery)
            ->with('variant.product', 'variant.attributeValues')
            ->orderByRaw('quantity - reserved_quantity')
            ->limit(6)
            ->get()
            ->map(fn (Inventory $i) => [
                'variant_id' => $i->variant_id,
                'product' => $i->variant->product->name,
                'variant' => $i->variant->label(),
                'sku' => $i->variant->sku,
                'available' => $i->available(),
            ]);

        $today = $report->summary($todayStart, $now->copy()->endOfDay()->utc());

        $recent = Order::query()->latest('id')->limit(6)->get()->map(fn (Order $o) => OrderController::summary($o));

        return response()->json([
            'kpis' => [
                'today_orders' => $todayOrders,
                'yesterday_orders' => $yesterdayOrders,
                'today_sales' => $today['gross_sales'],
                // Profit is reported separately from sales; see SalesReport for how it is calculated.
                'today_gross_profit' => $today['gross_profit'],
                'today_items_without_cost' => $today['items_without_cost'],
                'pending_orders' => Order::query()->where('status', OrderStatus::Pending)->count(),
                'low_stock_count' => (clone $lowStockQuery)->count(),
                'waiting_confirmation' => VendorOrder::query()->where('status', VendorOrderStatus::Pending)->count(),
                'return_rate_30d' => $shipped > 0 ? round($returned / $shipped * 100, 1) : 0.0,
                'shipped_30d' => $shipped,
            ],
            'orders_per_day' => $series,
            'pipeline' => collect(VendorOrderStatus::cases())->map(fn (VendorOrderStatus $s) => [
                'status' => $s->value,
                'label' => $s->label(),
                'count' => (int) ($pipeline[$s->value] ?? 0),
            ]),
            'recent_orders' => $recent,
            'low_stock' => $lowStock,
            'generated_at' => $now->toIso8601String(),
        ]);
    }
}
