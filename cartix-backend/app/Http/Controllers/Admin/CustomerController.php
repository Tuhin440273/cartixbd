<?php

namespace App\Http\Controllers\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Support\Money;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Customers are identified by their mobile number, because checkout is guest-only for now.
 * The list is built from orders, so it needs no separate customer records.
 */
class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'in:recent,orders,spent'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $cancelled = OrderStatus::Cancelled->value;

        $query = DB::table('orders')
            ->select('customer_phone')
            ->selectRaw('count(*) as orders_count')
            ->selectRaw('sum(case when status = ? then 1 else 0 end) as cancelled_count', [$cancelled])
            ->selectRaw('coalesce(sum(case when status <> ? then grand_total else 0 end), 0) as total_spent', [$cancelled])
            ->selectRaw('min(created_at) as first_order_at, max(created_at) as last_order_at, max(id) as last_order_id')
            ->groupBy('customer_phone');

        if (! empty($data['q'])) {
            $q = trim($data['q']);
            $like = '%'.addcslashes($q, '%_\\').'%';
            $query->where(fn ($w) => $w->where('customer_name', 'like', $like)
                ->orWhere('customer_phone', Phone::isValid($q) ? Phone::normalize($q) : $q)
                ->orWhere('customer_phone', 'like', $like));
        }
        match ($data['sort'] ?? 'recent') {
            'orders' => $query->orderByDesc('orders_count'),
            'spent' => $query->orderByDesc('total_spent'),
            default => $query->orderByDesc('last_order_at'),
        };

        $page = $query->paginate(25);
        $latest = Order::query()->whereIn('id', collect($page->items())->pluck('last_order_id'))->get()->keyBy('id');

        return response()->json([
            'data' => collect($page->items())->map(fn ($r) => [
                'phone' => $r->customer_phone,
                'name' => $latest[$r->last_order_id]?->customer_name,
                'district' => $latest[$r->last_order_id]?->ship_district_name,
                'orders_count' => (int) $r->orders_count,
                'cancelled_count' => (int) $r->cancelled_count,
                'total_spent' => Money::toDecimal(Money::toPoisha((string) $r->total_spent)),
                'first_order_at' => $r->first_order_at ? Carbon::parse($r->first_order_at, 'UTC')->toIso8601String() : null,
                'last_order_at' => $r->last_order_at ? Carbon::parse($r->last_order_at, 'UTC')->toIso8601String() : null,
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(string $phone): JsonResponse
    {
        abort_if(! Phone::isValid($phone), 404, 'Customer not found.');
        $phone = Phone::normalize($phone);
        $orders = Order::query()->where('customer_phone', $phone)->latest('id')->get();
        abort_if($orders->isEmpty(), 404, 'Customer not found.');

        $spent = $orders->where('status', '!=', OrderStatus::Cancelled)
            ->sum(fn (Order $o) => Money::toPoisha((string) $o->grand_total));
        $latest = $orders->first();

        return response()->json(['data' => [
            'phone' => $phone,
            'name' => $latest->customer_name,
            'email' => $orders->pluck('customer_email')->filter()->first(),
            'last_address' => [
                'recipient_name' => $latest->ship_recipient_name,
                'phone' => $latest->ship_phone,
                'address_line' => $latest->ship_address_line,
                'area' => $latest->ship_upazila_name,
                'district' => $latest->ship_district_name,
                'division' => $latest->ship_division_name,
            ],
            'orders_count' => $orders->count(),
            'cancelled_count' => $orders->where('status', OrderStatus::Cancelled)->count(),
            'total_spent' => Money::toDecimal($spent),
            'orders' => $orders->take(50)->map(fn (Order $o) => OrderController::summary($o))->values(),
        ]]);
    }
}
