<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendors', function (Blueprint $table) {
            $table->id();
            // Single source of ownership. NOT NULL, so every shop has exactly one owner.
            $table->foreignId('owner_user_id')->constrained('users')->restrictOnDelete();
            $table->string('shop_name', 150);
            $table->string('slug', 170)->unique();
            $table->string('logo')->nullable();
            $table->string('banner')->nullable();
            $table->text('description')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email')->nullable();
            $table->string('pickup_address', 500)->nullable();
            $table->foreignId('district_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 20)->default('pending');
            // When empty, the category rate and then the default rate from settings apply.
            $table->decimal('commission_rate', 5, 2)->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index('status');
        });

        // Staff only; the owner is never stored here.
        Schema::create('vendor_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20)->default('staff');
            $table->timestamps();
            $table->unique(['vendor_id', 'user_id']);
        });

        Schema::create('vendor_kyc', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->unique()->constrained()->cascadeOnDelete();
            // Encrypted cast, so TEXT: the ciphertext length is unpredictable.
            $table->text('nid_number')->nullable();
            $table->string('nid_front_path')->nullable();
            $table->string('nid_back_path')->nullable();
            $table->string('trade_license_no', 100)->nullable();
            $table->string('trade_license_path')->nullable();
            $table->string('tin_no', 50)->nullable();
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamps();
        });

        Schema::create('vendor_payout_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->string('method', 20);
            $table->string('account_name', 150);
            $table->text('account_number'); // encrypted
            $table->string('bank_name', 150)->nullable();
            $table->string('branch_name', 150)->nullable();
            $table->string('routing_number', 30)->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_payout_accounts');
        Schema::dropIfExists('vendor_kyc');
        Schema::dropIfExists('vendor_users');
        Schema::dropIfExists('vendors');
    }
};
