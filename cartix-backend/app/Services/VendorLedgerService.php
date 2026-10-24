<?php

namespace App\Services;

use App\Enums\VendorTransactionType;
use App\Models\Vendor;
use App\Models\VendorOrder;
use App\Models\VendorTransaction;
use App\Support\Money;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/** Vendor ledger: every transaction is a new row; balance_after builds on the previous row. */
final class VendorLedgerService
{
    /** Days that delivered sales are held before payout (the return window). */
    public const HOLD_DAYS = 7;

    public function post(
        int $vendorId,
        VendorTransactionType $type,
        int $amountPoisha,
        ?Model $reference = null,
        ?DateTimeInterface $availableAt = null,
        ?string $description = null,
        ?int $userId = null,
    ): VendorTransaction {
        return DB::transaction(function () use ($vendorId, $type, $amountPoisha, $reference, $availableAt, $description, $userId) {
            // Lock the vendor row so concurrent postings cannot corrupt the running balance.
            Vendor::query()->whereKey($vendorId)->lockForUpdate()->firstOrFail();

            $last = VendorTransaction::query()->where('vendor_id', $vendorId)->orderByDesc('id')->first();
            $balance = ($last ? Money::toPoisha((string) $last->balance_after) : 0) + $amountPoisha;

            return VendorTransaction::query()->create([
                'vendor_id' => $vendorId,
                'type' => $type,
                'amount' => Money::toDecimal($amountPoisha),
                'balance_after' => Money::toDecimal($balance),
                'reference_type' => $reference?->getMorphClass(),
                'reference_id' => $reference?->getKey(),
                'available_at' => $availableAt,
                'description' => $description,
                'created_by' => $userId,
            ]);
        });
    }

    /** On delivery: credit the sale and debit the commission. */
    public function recordDelivered(VendorOrder $vo, ?int $userId = null): void
    {
        $availableAt = now()->addDays(self::HOLD_DAYS);
        $commission = Money::toPoisha((string) $vo->commission_amount);
        $saleCredit = Money::toPoisha((string) $vo->vendor_earning) + $commission;

        $this->post($vo->vendor_id, VendorTransactionType::SaleCredit, $saleCredit, $vo, $availableAt,
            "Sale {$vo->sub_number}", $userId);
        if ($commission > 0) {
            $this->post($vo->vendor_id, VendorTransactionType::CommissionDebit, -$commission, $vo, $availableAt,
                "Commission {$vo->sub_number}", $userId);
        }
    }

    /** When a delivered vendor order comes back: reverse the earlier entries. */
    public function reverseDelivered(VendorOrder $vo, ?int $userId = null): void
    {
        $commission = Money::toPoisha((string) $vo->commission_amount);
        $saleCredit = Money::toPoisha((string) $vo->vendor_earning) + $commission;

        $this->post($vo->vendor_id, VendorTransactionType::RefundDebit, -$saleCredit, $vo, now(),
            "Return {$vo->sub_number}", $userId);
        if ($commission > 0) {
            $this->post($vo->vendor_id, VendorTransactionType::Adjustment, $commission, $vo, now(),
                "Commission returned {$vo->sub_number}", $userId);
        }
    }

    public function balance(int $vendorId): int
    {
        $last = VendorTransaction::query()->where('vendor_id', $vendorId)->orderByDesc('id')->first();

        return $last ? Money::toPoisha((string) $last->balance_after) : 0;
    }
}
