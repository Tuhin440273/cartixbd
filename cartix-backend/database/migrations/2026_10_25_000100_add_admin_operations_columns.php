<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Admin operations:
 * - order_items.unit_cost: cost price snapshot at checkout, so profit reports stay correct when cost prices change later.
 * - districts.is_deliverable: delivery coverage switch, so the shop can start with Dhaka only and open more districts later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->decimal('unit_cost', 12, 2)->nullable()->after('unit_price');
        });
        Schema::table('districts', function (Blueprint $table) {
            $table->boolean('is_deliverable')->default(true)->after('shipping_zone');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('unit_cost'));
        Schema::table('districts', fn (Blueprint $table) => $table->dropColumn('is_deliverable'));
    }
};
