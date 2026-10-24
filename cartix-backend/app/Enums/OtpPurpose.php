<?php

namespace App\Enums;

enum OtpPurpose: string
{
    use HasLabel;

    case Login = 'login';
    case Reset = 'reset';
    case Verify = 'verify';
    case GuestReturn = 'guest_return';

    public function label(): string
    {
        return match ($this) {
            self::Login => 'Login',
            self::Reset => 'Password reset',
            self::Verify => 'Verification',
            self::GuestReturn => 'Guest return',
        };
    }
}
