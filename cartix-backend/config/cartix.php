<?php

return [
    /*
    | Payment methods offered at checkout. Only add an online method after its gateway integration,
    | including server-side payment verification, has been implemented and tested.
    */
    'payment_methods' => array_values(array_filter(array_map('trim', explode(',', (string) env('CARTIX_PAYMENT_METHODS', 'cod'))))),

    /* Days a guest cart is kept after its last change. */
    'cart_lifetime_days' => (int) env('CARTIX_CART_LIFETIME_DAYS', 30),

    /*
    | Proxies whose X-Forwarded-For header is trusted (the storefront server, Nginx). Only then do rate
    | limits and stored order IP addresses use the real customer address. Comma-separated, or "*".
    */
    'trusted_proxies' => env('TRUSTED_PROXIES'),

    /* Requests per minute per client IP address. */
    'rate_limits' => [
        'storefront' => (int) env('CARTIX_RATE_LIMIT_STOREFRONT', 240),
        'checkout' => (int) env('CARTIX_RATE_LIMIT_CHECKOUT', 10),
        'order_lookup' => (int) env('CARTIX_RATE_LIMIT_ORDER_LOOKUP', 10),
    ],
];
