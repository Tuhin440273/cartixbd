<?php

namespace App\Models;

use App\Enums\ShippingZone;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ShippingRate extends Model
{
    use HasFactory;

    protected $fillable = [
        'zone',
        'base_fee',
        'per_kg_fee',
        'min_days',
        'max_days',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'zone' => ShippingZone::class,
            'base_fee' => 'decimal:2',
            'per_kg_fee' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }
}
