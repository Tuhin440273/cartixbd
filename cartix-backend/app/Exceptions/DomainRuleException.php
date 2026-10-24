<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown when a business rule is broken (out of stock, invalid status change, unusable coupon).
 * The API returns it as HTTP 422; the message is safe to show to customers and admins.
 */
class DomainRuleException extends RuntimeException {}
