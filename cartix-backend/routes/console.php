<?php

use App\Services\InventoryService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Stock held by an online payment that is not completed within 30 minutes is released for sale again.
Artisan::command('cartix:release-expired-stock', function (InventoryService $inventory) {
    $count = $inventory->releaseExpired();
    $this->info("Released {$count} expired stock reservation(s).");
})->purpose('Release stock held by unpaid online orders');

Schedule::command('cartix:release-expired-stock')->everyFiveMinutes()->withoutOverlapping();
