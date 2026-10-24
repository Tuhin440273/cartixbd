<?php

namespace App\Models;

use App\Enums\KycStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VendorKyc extends Model
{
    use HasFactory;

    protected $table = 'vendor_kyc';

    protected $fillable = [
        'vendor_id',
        'nid_number',
        'nid_front_path',
        'nid_back_path',
        'trade_license_no',
        'trade_license_path',
        'tin_no',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_note',
    ];

    protected function casts(): array
    {
        return [
            'nid_number' => 'encrypted',
            'status' => KycStatus::class,
            'reviewed_at' => 'datetime',
        ];
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    protected $hidden = ['nid_number', 'nid_front_path', 'nid_back_path'];
}
