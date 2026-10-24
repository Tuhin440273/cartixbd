<?php

namespace App\Services;

use App\Enums\ReservationStatus;
use App\Enums\StockMovementReason;
use App\Exceptions\DomainRuleException;
use App\Models\Inventory;
use App\Models\InventoryReservation;
use App\Models\OrderItem;
use App\Models\StockMovement;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Stock rules (from the design document):
 *  1. Placing an order increases reserved_quantity and creates an active reservation.
 *  2. Shipping decreases quantity and reserved_quantity, converts the reservation and logs a sale movement.
 *  3. Cancellation or expiry only decreases reserved_quantity and releases the reservation.
 * stock_movements only records changes to the physical quantity.
 */
final class InventoryService
{
    /** Add or remove stock (purchases, stock counts, returns). */
    public function adjust(
        int $variantId,
        int $change,
        StockMovementReason $reason,
        ?int $userId = null,
        ?string $note = null,
        ?Model $reference = null,
    ): Inventory {
        if ($change === 0) {
            throw new DomainRuleException('The stock change cannot be zero.');
        }

        return DB::transaction(function () use ($variantId, $change, $reason, $userId, $note, $reference) {
            Inventory::query()->firstOrCreate(['variant_id' => $variantId]);
            $inventory = $this->lock($variantId);

            $before = $inventory->quantity;
            $after = $before + $change;
            if ($after < $inventory->reserved_quantity) {
                throw new DomainRuleException('Stock cannot go below the quantity already reserved for orders.');
            }

            $inventory->update(['quantity' => $after]);
            $this->recordMovement($variantId, $change, $before, $after, $reason, $userId, $note, $reference);

            return $inventory;
        });
    }

    /** Reserve stock for an order line. Must be called inside the checkout transaction. */
    public function reserve(OrderItem $item, ?DateTimeInterface $expiresAt = null): InventoryReservation
    {
        $this->assertInTransaction();
        $inventory = $this->lock($item->variant_id);

        if ($inventory === null || $inventory->available() < $item->quantity) {
            throw new DomainRuleException("Not enough stock for {$item->product_name}".($item->variant_label ? " ({$item->variant_label})" : '').'.');
        }

        $inventory->increment('reserved_quantity', $item->quantity);

        return InventoryReservation::query()->create([
            'variant_id' => $item->variant_id,
            'order_item_id' => $item->id,
            'quantity' => $item->quantity,
            'status' => ReservationStatus::Active,
            'expires_at' => $expiresAt,
        ]);
    }

    /** When an item ships, deduct it from physical stock. */
    public function convert(InventoryReservation $reservation, ?int $userId = null): void
    {
        DB::transaction(function () use ($reservation, $userId) {
            $reservation = InventoryReservation::query()->whereKey($reservation->id)->lockForUpdate()->firstOrFail();
            if ($reservation->status !== ReservationStatus::Active) {
                throw new DomainRuleException('This item is no longer reserved.');
            }

            $inventory = $this->lock($reservation->variant_id);
            $before = $inventory->quantity;
            $after = $before - $reservation->quantity;

            $inventory->update([
                'quantity' => $after,
                'reserved_quantity' => $inventory->reserved_quantity - $reservation->quantity,
            ]);
            $reservation->update(['status' => ReservationStatus::Converted]);

            $this->recordMovement(
                $reservation->variant_id, -$reservation->quantity, $before, $after,
                StockMovementReason::Sale, $userId, null, $reservation->orderItem,
            );
        });
    }

    /** Release reserved stock when an order is cancelled or its payment window expires. */
    public function release(InventoryReservation $reservation): void
    {
        DB::transaction(function () use ($reservation) {
            $reservation = InventoryReservation::query()->whereKey($reservation->id)->lockForUpdate()->firstOrFail();
            if ($reservation->status !== ReservationStatus::Active) {
                return; // Already released or sold; never release twice.
            }

            $inventory = $this->lock($reservation->variant_id);
            $inventory->update(['reserved_quantity' => $inventory->reserved_quantity - $reservation->quantity]);
            $reservation->update(['status' => ReservationStatus::Released, 'released_at' => now()]);
        });
    }

    /** Release expired reservations; the scheduler runs this every five minutes. */
    public function releaseExpired(): int
    {
        $count = 0;
        InventoryReservation::query()
            ->where('status', ReservationStatus::Active)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->orderBy('id')
            ->each(function (InventoryReservation $r) use (&$count) {
                $this->release($r);
                $count++;
            });

        return $count;
    }

    private function lock(int $variantId): ?Inventory
    {
        return Inventory::query()->where('variant_id', $variantId)->lockForUpdate()->first();
    }

    private function recordMovement(
        int $variantId, int $change, int $before, int $after, StockMovementReason $reason,
        ?int $userId, ?string $note, ?Model $reference,
    ): void {
        StockMovement::query()->create([
            'variant_id' => $variantId,
            'change' => $change,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'reason' => $reason,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'user_id' => $userId,
            'note' => $note,
        ]);
    }

    private function assertInTransaction(): void
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Stock must be reserved inside a database transaction');
        }
    }
}
