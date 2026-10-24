<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Storefront support. Additive and reversible:
 *  - The application is English-only, so the legacy *_bn columns become optional (kept, never dropped).
 *  - Guest carts remember the price shown when an item was added, to flag later price changes.
 *  - Orders get an idempotency key (duplicate checkout protection) and a hashed access token
 *    (lets the customer who placed an order view it without exposing it to anyone who knows the number).
 */
return new class extends Migration
{
    /** @var array<string, int> table => length of its legacy name_bn column */
    private const LEGACY_BN = [
        'divisions' => 100,
        'districts' => 100,
        'upazilas' => 100,
        'categories' => 150,
        'attributes' => 100,
    ];

    public function up(): void
    {
        foreach (self::LEGACY_BN as $table => $length) {
            Schema::table($table, function (Blueprint $t) use ($length) {
                $t->string('name_bn', $length)->nullable()->change();
            });
        }

        Schema::table('cart_items', function (Blueprint $t) {
            $t->decimal('unit_price_at_add', 12, 2)->nullable()->after('quantity');
        });

        Schema::table('orders', function (Blueprint $t) {
            $t->string('checkout_key', 64)->nullable()->unique()->after('order_number');
            $t->string('access_token_hash', 64)->nullable()->after('checkout_key');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->dropUnique(['checkout_key']);
            $t->dropColumn(['checkout_key', 'access_token_hash']);
        });

        Schema::table('cart_items', function (Blueprint $t) {
            $t->dropColumn('unit_price_at_add');
        });
        // The *_bn columns stay nullable on rollback: restoring NOT NULL could fail on rows without legacy values.
    }
};
