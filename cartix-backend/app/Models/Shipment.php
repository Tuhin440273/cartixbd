<?php

namespace App\Models;

use App\Enums\Courier;
use App\Enums\ShipmentStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Shipment extends Model
{
    use HasFactory;

    protected $fillable = [
        'vendor_order_id',
        'courier',
        'consignment_id',
        'tracking_code',
        'cod_amount',
        'delivery_charge',
        'status',
        'shipped_at',
        'delivered_at',
        'courier_payload',
    ];

    protected function casts(): array
    {
        return [
            'courier' => Courier::class,
            'cod_amount' => 'decimal:2',
            'delivery_charge' => 'decimal:2',
            'status' => ShipmentStatus::class,
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'courier_payload' => 'array',
        ];
    }

    public function vendorOrder(): BelongsTo
    {
        return $this->belongsTo(VendorOrder::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(ShipmentStatusHistory::class);
    }
}
