<?php

namespace App\Models;

use App\Enums\VendorStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Vendor extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'owner_user_id',
        'shop_name',
        'slug',
        'logo',
        'banner',
        'description',
        'phone',
        'email',
        'pickup_address',
        'district_id',
        'status',
        'commission_rate',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => VendorStatus::class,
            'commission_rate' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function staff(): HasMany
    {
        return $this->hasMany(VendorUser::class);
    }

    public function kyc(): HasOne
    {
        return $this->hasOne(VendorKyc::class);
    }

    public function payoutAccounts(): HasMany
    {
        return $this->hasMany(VendorPayoutAccount::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function vendorOrders(): HasMany
    {
        return $this->hasMany(VendorOrder::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(VendorTransaction::class);
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function district(): BelongsTo
    {
        return $this->belongsTo(District::class);
    }

    public const CARTIX_OFFICIAL_ID = 1;

    public function isApproved(): bool
    {
        return $this->status === VendorStatus::Approved;
    }

    /** Owner or staff member: may act on behalf of the shop. */
    public function hasMember(User $user): bool
    {
        return $this->owner_user_id === $user->id
            || $this->staff()->where('user_id', $user->id)->exists();
    }
}
