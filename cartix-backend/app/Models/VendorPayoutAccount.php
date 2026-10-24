<?php

namespace App\Models;

use App\Enums\PayoutMethod;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VendorPayoutAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'vendor_id',
        'method',
        'account_name',
        'account_number',
        'bank_name',
        'branch_name',
        'routing_number',
        'is_default',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'method' => PayoutMethod::class,
            'account_number' => 'encrypted',
            'is_default' => 'boolean',
            'verified_at' => 'datetime',
        ];
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    protected $hidden = ['account_number'];

    protected static function booted(): void
    {
        // Changing payout details clears verification, so money cannot be redirected to a hijacked account.
        static::updating(function (self $account) {
            if ($account->isDirty(['account_number', 'method', 'bank_name', 'routing_number'])) {
                $account->verified_at = null;
            }
        });
    }
}
