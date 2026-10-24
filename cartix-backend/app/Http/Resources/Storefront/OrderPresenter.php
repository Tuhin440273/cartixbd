<?php

namespace App\Http\Resources\Storefront;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\VendorOrder;
use App\Support\Media;

/**
 * Customer-facing view of an order. Never includes internal fields (IP address, checkout key,
 * token hash, commission, vendor earnings). The limited view, used for phone-based lookup,
 * also masks contact details and the street address.
 */
final class OrderPresenter
{
    /** @return array<string, mixed> */
    public static function present(Order $order, bool $full): array
    {
        $order->loadMissing(['items', 'vendorOrders.shipments']);

        return [
            'order_number' => $order->order_number,
            'placed_at' => $order->created_at?->toIso8601String(),
            'status' => ['code' => $order->status->value, 'label' => $order->status->label()],
            'payment' => [
                'method' => $order->payment_method->value,
                'method_label' => $order->payment_method->label(),
                'status' => $order->payment_status->value,
                'status_label' => $order->payment_status->label(),
            ],
            'totals' => [
                'subtotal' => (string) $order->subtotal,
                'discount' => (string) $order->discount_total,
                'shipping' => (string) $order->shipping_total,
                'shipping_discount' => (string) $order->shipping_discount,
                'total' => (string) $order->grand_total,
            ],
            'customer' => [
                'name' => $full ? $order->customer_name : self::maskName($order->customer_name),
                'phone' => $full ? $order->customer_phone : self::maskPhone($order->customer_phone),
                'email' => $full ? $order->customer_email : null,
            ],
            'shipping_address' => [
                'recipient_name' => $full ? $order->ship_recipient_name : self::maskName($order->ship_recipient_name),
                'phone' => $full ? $order->ship_phone : self::maskPhone($order->ship_phone),
                'division' => $order->ship_division_name,
                'district' => $order->ship_district_name,
                'area' => $order->ship_upazila_name,
                'address_line' => $full ? $order->ship_address_line : null,
                'postcode' => $full ? $order->ship_postcode : null,
            ],
            'note' => $full ? $order->customer_note : null,
            'shipments' => $order->vendorOrders->map(fn (VendorOrder $vo) => [
                'number' => $vo->sub_number,
                'status' => ['code' => $vo->status->value, 'label' => $vo->status->label()],
                'tracking' => $vo->shipments->map(fn ($s) => [
                    'courier' => $s->courier,
                    'tracking_code' => $s->tracking_code,
                ])->filter(fn ($t) => $t['tracking_code'] !== null)->values(),
                'item_ids' => $order->items->where('vendor_order_id', $vo->id)->pluck('id')->values(),
            ])->values(),
            'items' => $order->items->map(fn (OrderItem $i) => [
                'id' => $i->id,
                'product_name' => $i->product_name,
                'variant_label' => $i->variant_label,
                'sku' => $i->sku,
                'image' => $i->product_image ? Media::url($i->product_image) : null,
                'unit_price' => (string) $i->unit_price,
                'quantity' => $i->quantity,
                'discount' => (string) $i->discount_amount,
                'line_total' => (string) $i->line_total,
            ])->values(),
        ];
    }

    public static function maskPhone(?string $phone): ?string
    {
        if ($phone === null || strlen($phone) < 7) {
            return $phone === null ? null : '***';
        }

        return substr($phone, 0, 3).str_repeat('*', strlen($phone) - 6).substr($phone, -3);
    }

    public static function maskName(?string $name): ?string
    {
        if ($name === null || trim($name) === '') {
            return null;
        }
        $first = strtok(trim($name), ' ');

        return $first.(str_contains(trim($name), ' ') ? ' ***' : '');
    }
}
