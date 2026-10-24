<?php

namespace App\Models;

use App\Enums\ShippingZone;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class District extends Model
{
    use HasFactory;

    protected $fillable = [
        'division_id',
        'name',
        'name_bn',
        'shipping_zone',
        'is_deliverable',
    ];

    protected function casts(): array
    {
        return [
            'shipping_zone' => ShippingZone::class,
            'is_deliverable' => 'boolean',
        ];
    }

    public function division(): BelongsTo
    {
        return $this->belongsTo(Division::class);
    }

    public function upazilas(): HasMany
    {
        return $this->hasMany(Upazila::class);
    }
}
