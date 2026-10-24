<?php

namespace App\Models;

use App\Enums\VendorTransactionType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class VendorTransaction extends Model
{
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = [
        'vendor_id',
        'type',
        'amount',
        'balance_after',
        'reference_type',
        'reference_id',
        'available_at',
        'description',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'type' => VendorTransactionType::class,
            'amount' => 'decimal:2',
            'balance_after' => 'decimal:2',
            'available_at' => 'datetime',
        ];
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function reference(): MorphTo
    {
        return $this->morphTo();
    }

    protected static function booted(): void
    {
        // The ledger is append-only; corrections must be posted as adjustment entries.
        static::updating(fn () => throw new \LogicException('Vendor ledger entries cannot be changed'));
        static::deleting(fn () => throw new \LogicException('Vendor ledger entries cannot be deleted'));
    }
}
