<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // The person who placed the order
            $table->string('customer_name', 150);
            $table->string('customer_phone', 20);
            $table->string('customer_email')->nullable();

            // The person receiving the parcel: a snapshot taken at order time
            $table->string('ship_recipient_name', 150);
            $table->string('ship_phone', 20);
            $table->string('ship_division_name', 100);
            $table->foreignId('ship_district_id')->constrained('districts')->restrictOnDelete();
            $table->string('ship_district_name', 100);
            $table->string('ship_upazila_name', 100)->nullable();
            $table->string('ship_address_line', 500);
            $table->string('ship_postcode', 20)->nullable();

            // Money: rules live in OrderPricingService
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount_total', 12, 2)->default(0);
            $table->decimal('shipping_total', 12, 2)->default(0);
            $table->decimal('shipping_discount', 12, 2)->default(0);
            $table->decimal('grand_total', 12, 2);

            $table->string('payment_method', 20);
            $table->string('payment_status', 20)->default('unpaid');
            $table->string('status', 20)->default('pending');
            $table->foreignId('coupon_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('customer_note', 1000)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index('customer_phone');
            $table->index(['status', 'created_at']);
        });

        Schema::create('vendor_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->foreignId('vendor_id')->constrained()->restrictOnDelete();
            $table->string('sub_number', 40)->unique();
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('shipping_fee', 12, 2)->default(0);
            $table->decimal('shipping_discount', 12, 2)->default(0);
            $table->decimal('commission_amount', 12, 2)->default(0);
            $table->decimal('vendor_earning', 12, 2)->default(0);
            $table->string('status', 20)->default('pending');
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            $table->unique(['order_id', 'vendor_id']);
            $table->index(['vendor_id', 'status', 'created_at']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->foreignId('vendor_order_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            // snapshot
            $table->string('product_name', 200);
            $table->string('variant_label', 150)->nullable();
            $table->string('sku', 100);
            $table->string('product_image')->nullable();
            $table->decimal('unit_price', 12, 2);
            $table->unsignedInteger('quantity');
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('platform_discount_amount', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2);
            $table->decimal('commission_rate', 5, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('order_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->foreignId('vendor_order_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 1000)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('inventory_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->foreignId('order_item_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedInteger('quantity');
            // active / converted / released
            $table->string('status', 20)->default('active');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'expires_at']);
        });

        Schema::create('shipments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_order_id')->constrained()->restrictOnDelete();
            $table->string('courier', 20);
            $table->string('consignment_id', 100)->nullable();
            $table->string('tracking_code', 100)->nullable();
            $table->decimal('cod_amount', 12, 2)->default(0);
            $table->decimal('delivery_charge', 12, 2)->default(0);
            $table->string('status', 30)->default('pending');
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->json('courier_payload')->nullable();
            $table->timestamps();
            $table->index('tracking_code');
            $table->index(['courier', 'consignment_id']);
        });

        Schema::create('shipment_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_id')->constrained()->restrictOnDelete();
            $table->string('status', 30);
            $table->string('courier_status', 100)->nullable();
            $table->string('note', 1000)->nullable();
            $table->timestamp('occurred_at');
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_status_histories');
        Schema::dropIfExists('shipments');
        Schema::dropIfExists('inventory_reservations');
        Schema::dropIfExists('order_status_histories');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('vendor_orders');
        Schema::dropIfExists('orders');
    }
};
