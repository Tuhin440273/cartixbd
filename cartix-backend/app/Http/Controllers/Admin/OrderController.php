<?php

namespace App\Http\Controllers\Admin;

use App\Enums\OrderStatus;
use App\Enums\VendorOrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\VendorOrder;
use App\Services\Admin\ActivityLogger;
use App\Services\OrderStatusService;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderStatusService $status,
        private readonly ActivityLogger $activity,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(OrderStatus::class)],
            'q' => ['nullable', 'string', 'max:50'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $query = Order::query()->latest('id');
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        if (! empty($data['q'])) {
            $q = trim($data['q']);
            $query->where(function ($w) use ($q) {
                $w->where('order_number', 'like', '%'.addcslashes($q, '%_\\').'%');
                if (Phone::isValid($q)) {
                    $w->orWhere('customer_phone', Phone::normalize($q))->orWhere('ship_phone', Phone::normalize($q));
                }
                $w->orWhere('customer_name', 'like', '%'.addcslashes($q, '%_\\').'%');
            });
        }

        $page = $query->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => collect($page->items())->map(fn (Order $o) => self::summary($o)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'status_counts' => Order::query()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
        ]);
    }

    public function show(Order $order): JsonResponse
    {
        $order->load(['vendorOrders.vendor', 'vendorOrders.items', 'statusHistories.changedBy', 'coupon']);

        return response()->json(['data' => [
            ...self::summary($order),
            'customer_email' => $order->customer_email,
            'ship' => [
                'recipient_name' => $order->ship_recipient_name,
                'phone' => $order->ship_phone,
                'division' => $order->ship_division_name,
                'district' => $order->ship_district_name,
                'upazila' => $order->ship_upazila_name,
                'address_line' => $order->ship_address_line,
                'postcode' => $order->ship_postcode,
            ],
            'totals' => [
                'subtotal' => $order->subtotal,
                'discount_total' => $order->discount_total,
                'shipping_total' => $order->shipping_total,
                'shipping_discount' => $order->shipping_discount,
                'grand_total' => $order->grand_total,
            ],
            'coupon_code' => $order->coupon?->code,
            'customer_note' => $order->customer_note,
            'vendor_orders' => $order->vendorOrders->map(fn (VendorOrder $vo) => [
                'id' => $vo->id,
                'sub_number' => $vo->sub_number,
                'vendor' => $vo->vendor->shop_name,
                'status' => $vo->status->value,
                'status_label' => $vo->status->label(),
                'allowed_next' => array_map(fn (VendorOrderStatus $s) => ['value' => $s->value, 'label' => $s->label()], $vo->status->allowedNext()),
                'subtotal' => $vo->subtotal,
                'shipping_fee' => $vo->shipping_fee,
                'commission_amount' => $vo->commission_amount,
                'vendor_earning' => $vo->vendor_earning,
                'items' => $vo->items->map(fn (OrderItem $i) => [
                    'id' => $i->id,
                    'product_name' => $i->product_name,
                    'variant_label' => $i->variant_label,
                    'sku' => $i->sku,
                    'image' => $i->product_image,
                    'unit_price' => $i->unit_price,
                    'quantity' => $i->quantity,
                    'discount_amount' => $i->discount_amount,
                    'line_total' => $i->line_total,
                ]),
            ]),
            'history' => $order->statusHistories->sortByDesc('id')->values()->map(fn (OrderStatusHistory $h) => [
                'from' => $h->from_status,
                'to' => $h->to_status,
                'note' => $h->note,
                'by' => $h->changedBy?->name,
                'sub_order' => $h->vendor_order_id,
                'at' => $h->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    public function confirm(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        $this->status->confirmOrder($order, $request->user(), $data['note'] ?? 'Confirmed by phone');
        $this->activity->log('order.confirmed', $order, ['order_number' => $order->order_number]);

        return $this->show($order->refresh());
    }

    public function cancel(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:500']]);
        $this->status->cancelOrder($order, $request->user(), $data['note']);
        $this->activity->log('order.cancelled', $order, ['order_number' => $order->order_number, 'note' => $data['note']]);

        return $this->show($order->refresh());
    }

    public function changeStatus(Request $request, VendorOrder $vendorOrder): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::enum(VendorOrderStatus::class)],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $from = $vendorOrder->status;
        $this->status->transition($vendorOrder, VendorOrderStatus::from($data['status']), $request->user(), $data['note'] ?? null);
        $this->activity->log('order.status_changed', $vendorOrder, [
            'sub_number' => $vendorOrder->sub_number, 'from' => $from->value, 'to' => $data['status'],
        ]);

        return $this->show($vendorOrder->order()->firstOrFail());
    }

    /** @return array<string, mixed> */
    public static function summary(Order $o): array
    {
        return [
            'id' => $o->id,
            'order_number' => $o->order_number,
            'customer_name' => $o->customer_name,
            'customer_phone' => $o->customer_phone,
            'district' => $o->ship_district_name,
            'payment_method' => $o->payment_method->value,
            'payment_method_label' => $o->payment_method->label(),
            'payment_status' => $o->payment_status->value,
            'grand_total' => $o->grand_total,
            'status' => $o->status->value,
            'status_label' => $o->status->label(),
            'created_at' => $o->created_at?->toIso8601String(),
        ];
    }
}
