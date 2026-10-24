<?php

namespace App\Models;

use App\Enums\ReturnResolution;
use App\Enums\ReturnStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReturnRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_item_id',
        'user_id',
        'requester_phone',
        'quantity',
        'reason',
        'images',
        'resolution',
        'status',
        'admin_note',
    ];

    protected function casts(): array
    {
        return [
            'images' => 'array',
            'resolution' => ReturnResolution::class,
            'status' => ReturnStatus::class,
        ];
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(ReturnRequestStatusHistory::class);
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class);
    }
}
