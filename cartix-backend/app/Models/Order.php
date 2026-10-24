<?php

namespace App\Models;

use App\Enums\OrderPaymentStatus;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_number',
        'checkout_key',
        'user_id',
        'customer_name',
        'customer_phone',
        'customer_email',
        'ship_recipient_name',
        'ship_phone',
        'ship_division_name',
        'ship_district_id',
        'ship_district_name',
        'ship_upazila_name',
        'ship_address_line',
        'ship_postcode',
        'subtotal',
        'discount_total',
        'shipping_total',
        'shipping_discount',
        'grand_total',
        'payment_method',
        'payment_status',
        'status',
        'coupon_id',
        'customer_note',
        'ip_address',
        'confirmed_at',
        'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'discount_total' => 'decimal:2',
            'shipping_total' => 'decimal:2',
            'shipping_discount' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'payment_method' => PaymentMethod::class,
            'payment_status' => OrderPaymentStatus::class,
            'status' => OrderStatus::class,
            'confirmed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function vendorOrders(): HasMany
    {
        return $this->hasMany(VendorOrder::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function shipDistrict(): BelongsTo
    {
        return $this->belongsTo(District::class, 'ship_district_id');
    }

    protected $hidden = ['access_token_hash', 'checkout_key', 'ip_address'];

    /** Set only on the request that created the order; the database stores just its SHA-256 hash. */
    public ?string $plainAccessToken = null;

    public function accessTokenMatches(?string $token): bool
    {
        return $token !== null && $this->access_token_hash !== null
            && hash_equals($this->access_token_hash, hash('sha256', $token));
    }
}
