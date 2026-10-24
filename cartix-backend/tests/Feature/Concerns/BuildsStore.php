<?php

namespace Tests\Feature\Concerns;

use App\Enums\PaymentMethod;
use App\Enums\ProductStatus;
use App\Enums\StockMovementReason;
use App\Enums\VendorStatus;
use App\Models\Category;
use App\Models\District;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Checkout\CheckoutData;
use App\Services\InventoryService;
use Database\Seeders\CartixBaseSeeder;
use Database\Seeders\LocationSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Str;

trait BuildsStore
{
    protected function seedBase(): void
    {
        $this->seed([RoleSeeder::class, LocationSeeder::class, CartixBaseSeeder::class]);
    }

    protected function admin(): User
    {
        return User::role('super_admin')->firstOrFail();
    }

    protected function makeVariant(string $price = '1250.00', int $stock = 10, int $vendorId = Vendor::CARTIX_OFFICIAL_ID, int $grams = 500): ProductVariant
    {
        $name = 'Test Hoodie '.Str::random(6);
        $product = Product::query()->create([
            'vendor_id' => $vendorId,
            'category_id' => Category::query()->where('slug', 'hoodies')->value('id'),
            'name' => $name,
            'slug' => Str::slug($name),
            'status' => ProductStatus::Active,
        ]);
        $variant = ProductVariant::query()->create([
            'product_id' => $product->id,
            'sku' => strtoupper(Str::random(10)),
            'price' => $price,
            'weight_grams' => $grams,
            'is_default' => true,
        ]);
        if ($stock > 0) {
            app(InventoryService::class)->adjust($variant->id, $stock, StockMovementReason::Purchase);
        }

        return $variant->fresh();
    }

    protected function makeSeller(string $commission = '10.00'): Vendor
    {
        $owner = User::query()->create(['name' => 'Seller', 'phone' => '0181'.random_int(1000000, 9999999), 'password' => 'secret-pass']);
        $vendor = new Vendor([
            'owner_user_id' => $owner->id,
            'shop_name' => 'Seller Shop',
            'slug' => 'seller-'.Str::random(5),
            'commission_rate' => $commission,
        ]);
        $vendor->forceFill(['status' => VendorStatus::Approved])->save();

        return $vendor;
    }

    /** @param list<array{variant_id:int, quantity:int}> $items */
    protected function checkoutData(array $items, array $overrides = []): CheckoutData
    {
        $args = array_merge([
            'items' => $items,
            'customerName' => 'Rakib Hasan',
            'customerPhone' => '01712345678',
            'customerEmail' => null,
            'recipientName' => 'Rakib Hasan',
            'recipientPhone' => '01712345678',
            'districtId' => District::query()->where('name', 'Dhaka')->value('id'),
            'upazilaId' => null,
            'addressLine' => 'House 12, Road 5, Mirpur',
            'postcode' => null,
            'paymentMethod' => PaymentMethod::Cod,
            'couponCode' => null,
        ], $overrides);

        return new CheckoutData(...$args);
    }
}
