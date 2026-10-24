<?php

namespace App\Providers;

use App\Models\ProductVariant;
use App\Observers\ProductVariantObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        ProductVariant::observe(ProductVariantObserver::class);

        $proxies = config('cartix.trusted_proxies');
        if (is_string($proxies) && trim($proxies) !== '') {
            TrustProxies::at(trim($proxies) === '*' ? '*' : array_map('trim', explode(',', $proxies)));
        }

        $tooMany = fn (string $message) => fn (Request $request, array $headers) => response()
            ->json(['message' => $message], 429, $headers);

        // Public storefront reads (catalog, cart).
        RateLimiter::for('storefront', fn (Request $request) => Limit::perMinute((int) config('cartix.rate_limits.storefront'))
            ->by('sf:'.$request->ip())
            ->response($tooMany('Too many requests. Please wait a moment and try again.')));

        // Placing orders.
        RateLimiter::for('checkout', fn (Request $request) => Limit::perMinute((int) config('cartix.rate_limits.checkout'))
            ->by('co:'.$request->ip())
            ->response($tooMany('Too many checkout attempts. Please wait a minute and try again.')));

        // Guest order lookup by phone: low limit, because it is a guessing target.
        RateLimiter::for('order-lookup', fn (Request $request) => Limit::perMinute((int) config('cartix.rate_limits.order_lookup'))
            ->by('ol:'.$request->ip())
            ->response($tooMany('Too many lookup attempts. Please wait a minute and try again.')));
    }
}
