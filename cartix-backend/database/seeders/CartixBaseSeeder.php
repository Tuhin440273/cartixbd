<?php

namespace Database\Seeders;

use App\Enums\UserStatus;
use App\Enums\VendorStatus;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Data the store cannot run without: the admin account, the "Cartix Official" shop (vendor id 1),
 * size and color lists, the starting categories and default settings.
 */
class CartixBaseSeeder extends Seeder
{
    public function run(): void
    {
        $phone = env('CARTIX_ADMIN_PHONE', '01700000000');
        $password = env('CARTIX_ADMIN_PASSWORD');
        $generated = false;
        if (! $password) {
            $password = Str::password(16, symbols: false);
            $generated = true;
        }

        $admin = User::query()->where('phone', $phone)->first();
        if ($admin === null) {
            $admin = new User(['name' => 'Cartix Admin', 'phone' => $phone, 'password' => $password]);
            $admin->forceFill(['status' => UserStatus::Active, 'phone_verified_at' => now()])->save();
            if ($generated && $this->command) {
                $this->command->warn("Admin login -> phone: {$phone}  password: {$password}  (save it now; set CARTIX_ADMIN_PASSWORD in .env for production)");
            }
        }
        $admin->assignRole('super_admin');

        if (Vendor::query()->find(Vendor::CARTIX_OFFICIAL_ID) === null) {
            $vendor = new Vendor([
                'owner_user_id' => $admin->id,
                'shop_name' => 'Cartix Official',
                'slug' => 'cartix-official',
                'commission_rate' => '0.00',
            ]);
            $vendor->id = Vendor::CARTIX_OFFICIAL_ID;
            $vendor->forceFill(['status' => VendorStatus::Approved, 'approved_at' => now()])->save();
        }

        $size = Attribute::query()->updateOrCreate(['code' => 'size'], ['name' => 'Size', 'type' => 'select']);
        foreach (['S', 'M', 'L', 'XL', 'XXL', '50', '52', '54', '56'] as $i => $v) {
            $size->values()->updateOrCreate(['value' => $v], ['sort_order' => $i]);
        }
        $color = Attribute::query()->updateOrCreate(['code' => 'color'], ['name' => 'Color', 'type' => 'color']);
        $colors = [
            ['Black', '#1E2228'], ['Navy', '#1D2C4A'], ['Grey', '#9AA0A8'], ['White', '#EDEDED'],
            ['Bottle Green', '#1F5A3D'], ['Maroon', '#7A1F2B'], ['Sky Blue', '#8FB4D9'], ['Olive', '#4B5A3A'],
            ['Off-white', '#EFE6D2'], ['Teal', '#146C6C'], ['Mustard', '#C8962E'], ['Rose', '#C76B8A'],
        ];
        foreach ($colors as $i => [$v, $hex]) {
            $color->values()->updateOrCreate(['value' => $v], ['color_hex' => $hex, 'sort_order' => $i]);
        }

        $tree = [
            ['Women', 'women', [['Borka', 'borka'], ['Three-piece', 'three-piece'], ['Kurti', 'kurti']]],
            ['Men', 'men', [['Shirts', 'shirts'], ['Hoodies', 'hoodies'], ['T-shirts', 't-shirts'], ['Panjabi', 'panjabi'], ['Jackets', 'jackets']]],
            ['Cosmetics', 'cosmetics', []],
        ];
        foreach ($tree as $i => [$name, $slug, $children]) {
            $parent = Category::query()->updateOrCreate(['slug' => $slug], ['name' => $name, 'sort_order' => $i]);
            foreach ($children as $j => [$childName, $childSlug]) {
                Category::query()->updateOrCreate(['slug' => $childSlug], [
                    'parent_id' => $parent->id, 'name' => $childName, 'sort_order' => $j,
                ]);
            }
        }

        Setting::query()->updateOrCreate(['key' => 'default_commission_rate'], ['value' => '10.00']);
        Setting::query()->updateOrCreate(['key' => 'store'], ['value' => [
            'name' => 'Cartix', 'hotline' => null, 'facebook' => null,
        ]]);
    }
}
