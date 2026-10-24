<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->string('method', 20);
            $table->decimal('amount', 12, 2);
            // initiated / success / failed / cancelled
            $table->string('status', 20)->default('initiated');
            $table->string('gateway', 30)->nullable();
            $table->string('gateway_order_id', 150)->nullable();
            $table->string('gateway_txn_id', 150)->nullable();
            $table->json('gateway_payload')->nullable();
            $table->string('failure_reason', 500)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
            // The same gateway transaction can never be counted twice (multiple NULLs are allowed).
            $table->unique(['gateway', 'gateway_txn_id']);
        });

        Schema::create('return_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_item_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('requester_phone', 20);
            $table->unsignedInteger('quantity');
            $table->string('reason', 1000);
            $table->json('images')->nullable();
            $table->string('resolution', 20);
            $table->string('status', 20)->default('requested');
            $table->string('admin_note', 1000)->nullable();
            $table->timestamps();
        });

        Schema::create('return_request_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('return_request_id')->constrained()->restrictOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 1000)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained()->restrictOnDelete();
            $table->foreignId('return_request_id')->nullable()->constrained()->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('method', 20);
            $table->string('reference', 150)->nullable();
            $table->string('status', 20)->default('pending');
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('coupon_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_phone', 20);
            $table->foreignId('order_id')->unique()->constrained()->restrictOnDelete();
            $table->decimal('discount_amount', 12, 2);
            $table->timestamps();
            $table->index(['coupon_id', 'customer_phone']);
        });

        // Vendor ledger: append-only, never updated or deleted.
        Schema::create('vendor_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->restrictOnDelete();
            $table->string('type', 30);
            $table->decimal('amount', 12, 2); // positive = credit, negative = debit
            $table->decimal('balance_after', 12, 2);
            $table->nullableMorphs('reference');
            $table->timestamp('available_at')->nullable();
            $table->string('description', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['vendor_id', 'created_at']);
            $table->index(['vendor_id', 'available_at']);
        });

        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->restrictOnDelete();
            $table->foreignId('payout_account_id')->constrained('vendor_payout_accounts')->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('status', 20)->default('requested');
            $table->string('transaction_reference', 150)->nullable();
            $table->timestamp('requested_at')->useCurrent();
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 1000)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payouts');
        Schema::dropIfExists('vendor_transactions');
        Schema::dropIfExists('coupon_usages');
        Schema::dropIfExists('refunds');
        Schema::dropIfExists('return_request_status_histories');
        Schema::dropIfExists('return_requests');
        Schema::dropIfExists('payments');
    }
};
