<?php

namespace App\Models;

use App\Enums\UserStatus;
use App\Support\Phone;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasRoles, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'phone',
        'email',
        'password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'status' => UserStatus::class,
            'phone_verified_at' => 'datetime',
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /** Phone numbers are always stored as 01XXXXXXXXX. */
    protected function phone(): Attribute
    {
        return Attribute::make(set: fn (string $value) => Phone::normalize($value));
    }

    public function isActive(): bool
    {
        return $this->status === null || $this->status === UserStatus::Active;
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function ownedVendors(): HasMany
    {
        return $this->hasMany(Vendor::class, 'owner_user_id');
    }

    public function vendorMemberships(): HasMany
    {
        return $this->hasMany(VendorUser::class);
    }
}
