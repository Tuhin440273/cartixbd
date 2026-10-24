<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\ReservationStatus;
use App\Enums\StockMovementReason;
use App\Enums\VendorOrderStatus;
use App\Exceptions\DomainRuleException;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Product;
use App\Models\User;
use App\Models\VendorOrder;
use Illuminate\Support\Facades\DB;

/**
 * Vendor order status changes and their side effects:
 *  shipped   -> reserved stock is deducted as sold
 *  cancelled -> reserved stock is released
 *  delivered -> sale credit and commission are posted to the vendor ledger
 *  returned  -> stock is restored; after delivery the ledger entries are reversed
 * The parent order status is then derived from its vendor orders.
 */
final class OrderStatusService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly VendorLedgerService $ledger,
    ) {}

    public function transition(VendorOrder $vendorOrder, VendorOrderStatus $to, ?User $by = null, ?string $note = null): VendorOrder
    {
        return DB::transaction(function () use ($vendorOrder, $to, $by, $note) {
            $vo = VendorOrder::query()->whereKey($vendorOrder->id)->lockForUpdate()->firstOrFail();
            $from = $vo->status;

            if (! $from->canTransitionTo($to)) {
                throw new DomainRuleException("An order cannot move from \"{$from->label()}\" to \"{$to->label()}\".");
            }

            $vo->load('items.reservation');
            match ($to) {
                VendorOrderStatus::Shipped => $this->onShipped($vo, $by),
                VendorOrderStatus::Cancelled => $this->onCancelled($vo),
                VendorOrderStatus::Delivered => $this->onDelivered($vo, $by),
                VendorOrderStatus::Returned => $this->onReturned($vo, $from, $by),
                default => null,
            };

            $vo->update([
                'status' => $to,
                'delivered_at' => $to === VendorOrderStatus::Delivered ? now() : $vo->delivered_at,
            ]);

            OrderStatusHistory::query()->create([
                'order_id' => $vo->order_id,
                'vendor_order_id' => $vo->id,
                'from_status' => $from->value,
                'to_status' => $to->value,
                'changed_by' => $by?->id,
                'note' => $note,
            ]);

            $this->syncOrderStatus($vo->order, $by);

            return $vo->refresh();
        });
    }

    /** "Confirmed by phone": confirm every pending vendor order at once. */
    public function confirmOrder(Order $order, ?User $by = null, ?string $note = null): Order
    {
        return $this->bulk($order, VendorOrderStatus::Pending, VendorOrderStatus::Confirmed, $by, $note);
    }

    /** Cancel every vendor order that has not shipped yet. */
    public function cancelOrder(Order $order, ?User $by = null, ?string $note = null): Order
    {
        return DB::transaction(function () use ($order, $by, $note) {
            $cancellable = $order->vendorOrders()->get()
                ->filter(fn (VendorOrder $vo) => $vo->status->canTransitionTo(VendorOrderStatus::Cancelled));
            if ($cancellable->isEmpty()) {
                throw new DomainRuleException('No part of this order can be cancelled any more.');
            }
            foreach ($cancellable as $vo) {
                $this->transition($vo, VendorOrderStatus::Cancelled, $by, $note);
            }

            return $order->refresh();
        });
    }

    private function bulk(Order $order, VendorOrderStatus $from, VendorOrderStatus $to, ?User $by, ?string $note): Order
    {
        return DB::transaction(function () use ($order, $from, $to, $by, $note) {
            $targets = $order->vendorOrders()->where('status', $from)->get();
            if ($targets->isEmpty()) {
                throw new DomainRuleException("No part of this order is \"{$from->label()}\".");
            }
            foreach ($targets as $vo) {
                $this->transition($vo, $to, $by, $note);
            }

            return $order->refresh();
        });
    }

    private function onShipped(VendorOrder $vo, ?User $by): void
    {
        foreach ($vo->items as $item) {
            if ($item->reservation?->status === ReservationStatus::Active) {
                $this->inventory->convert($item->reservation, $by?->id);
            } else {
                // An expired online-payment reservation cannot be shipped.
                throw new DomainRuleException("Stock for {$item->product_name} is no longer reserved. Check stock and place a new order.");
            }
        }
    }

    private function onDelivered(VendorOrder $vo, ?User $by): void
    {
        $this->ledger->recordDelivered($vo, $by?->id);
        foreach ($vo->items as $item) {
            Product::query()->whereKey($item->product_id)->increment('sold_count', $item->quantity);
        }
    }

    private function onCancelled(VendorOrder $vo): void
    {
        foreach ($vo->items as $item) {
            if ($item->reservation) {
                $this->inventory->release($item->reservation);
            }
        }
    }

    private function onReturned(VendorOrder $vo, VendorOrderStatus $from, ?User $by): void
    {
        foreach ($vo->items as $item) {
            $this->inventory->adjust($item->variant_id, $item->quantity, StockMovementReason::Return,
                $by?->id, "Returned {$vo->sub_number}", $item);
        }
        if ($from === VendorOrderStatus::Delivered) {
            $this->ledger->reverseDelivered($vo, $by?->id);
            foreach ($vo->items as $item) {
                Product::query()->whereKey($item->product_id)->where('sold_count', '>=', $item->quantity)
                    ->decrement('sold_count', $item->quantity);
            }
        }
    }

    /** Derive the parent order status from its vendor orders. */
    private function syncOrderStatus(Order $order, ?User $by): void
    {
        $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
        $statuses = $order->vendorOrders()->pluck('status')
            ->map(fn ($s) => $s instanceof VendorOrderStatus ? $s : VendorOrderStatus::from($s));
        $live = $statuses->reject(fn ($s) => $s === VendorOrderStatus::Cancelled);

        $next = match (true) {
            $live->isEmpty() => OrderStatus::Cancelled,
            $live->every(fn ($s) => $s->isFinal()) => OrderStatus::Completed,
            $live->every(fn ($s) => $s === VendorOrderStatus::Pending) => OrderStatus::Pending,
            $live->every(fn ($s) => $s === VendorOrderStatus::Confirmed) => OrderStatus::Confirmed,
            default => OrderStatus::Processing,
        };

        $previous = $order->status;
        if ($next === $previous) {
            return;
        }

        $order->update([
            'status' => $next,
            'confirmed_at' => $order->confirmed_at ?? ($next !== OrderStatus::Pending && $next !== OrderStatus::Cancelled ? now() : null),
            'cancelled_at' => $next === OrderStatus::Cancelled ? now() : $order->cancelled_at,
        ]);

        OrderStatusHistory::query()->create([
            'order_id' => $order->id,
            'from_status' => $previous->value,
            'to_status' => $next->value,
            'changed_by' => $by?->id,
        ]);
    }
}
