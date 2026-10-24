<?php

namespace App\Services\Checkout;

use App\Enums\PaymentMethod;

/** Validated checkout input. */
final class CheckoutData
{
    /**
     * @param  list<array{variant_id:int, quantity:int}>  $items
     */
    public function __construct(
        public readonly array $items,
        public readonly string $customerName,
        public readonly string $customerPhone,
        public readonly ?string $customerEmail,
        public readonly string $recipientName,
        public readonly string $recipientPhone,
        public readonly int $districtId,
        public readonly ?int $upazilaId,
        public readonly string $addressLine,
        public readonly ?string $postcode,
        public readonly PaymentMethod $paymentMethod,
        public readonly ?string $couponCode = null,
        public readonly ?string $note = null,
        public readonly ?int $userId = null,
        public readonly ?string $ipAddress = null,
        /** Free-text area (upazila or thana) when no upazila list is available for the district. */
        public readonly ?string $areaName = null,
        /** Idempotency key: repeating a checkout with the same key returns the original order. */
        public readonly ?string $checkoutKey = null,
        /** Order access token chosen by the caller (for example derived from the idempotency key); random when null. */
        public readonly ?string $accessToken = null,
    ) {}
}
