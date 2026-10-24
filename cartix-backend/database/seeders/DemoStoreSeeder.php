<?php

namespace Database\Seeders;

use App\Enums\CollectionType;
use App\Enums\PaymentMethod;
use App\Enums\ProductImageKind;
use App\Enums\ProductStatus;
use App\Enums\StockMovementReason;
use App\Enums\VendorOrderStatus;
use App\Models\Attribute;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\District;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCollection;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Checkout\CheckoutData;
use App\Services\Checkout\CheckoutService;
use App\Services\InventoryService;
use App\Services\OrderStatusService;
use Database\Seeders\Support\GarmentSvg;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Local development only: a demo catalog with generated SVG product images, a hanging-rail collection,
 * a home banner and a handful of orders in different states, so the storefront and admin dashboard
 * are not empty. Every order is created through the real CheckoutService and OrderStatusService.
 */
class DemoStoreSeeder extends Seeder
{
    /**
     * [category, name, kind, price, compare_at, grams, brand, featured, colors [[name, hex, accent]], sizes, description]
     *
     * @var list<array{0:string,1:string,2:string,3:int,4:?int,5:int,6:string,7:bool,8:list<array{0:string,1:string,2:?string}>,9:list<string>,10:string}>
     */
    private const CATALOG = [
        ['hoodies', 'Fleece Hoodie', 'hoodie', 1250, 1550, 650, 'Cartix Basics', true,
            [['Black', '#1E2228', null], ['Navy', '#1D2C4A', null]], ['M', 'L', 'XL'],
            'A midweight pullover hoodie with a lined hood, ribbed cuffs and a front kangaroo pocket.'],
        ['hoodies', 'Zip Hoodie', 'hoodie', 1190, null, 650, 'Cartix Basics', false,
            [['Grey', '#9AA0A8', null]], ['M', 'L', 'XL', 'XXL'],
            'A full-zip hoodie for layering, with a drawstring hood and ribbed hem.'],
        ['jackets', 'Bomber Jacket', 'jacket', 2190, 2490, 900, 'Cartix Studio', true,
            [['Olive', '#4B5A3A', null]], ['M', 'L', 'XL'],
            'A zip-front bomber jacket with a ribbed collar, cuffs and two front pockets.'],
        ['shirts', 'Oxford Shirt', 'shirt', 890, 1050, 300, 'Cartix Studio', true,
            [['Sky Blue', '#8FB4D9', null], ['White', '#EDEDED', null]], ['S', 'M', 'L', 'XL'],
            'A button-down Oxford shirt with a chest pocket, cut for everyday wear.'],
        ['t-shirts', 'Basic T-shirt', 't-shirt', 450, null, 200, 'Cartix Basics', false,
            [['Navy', '#1D2C4A', null], ['White', '#EDEDED', '#1D2C4A'], ['Black', '#1E2228', null]], ['M', 'L', 'XL'],
            'A crew-neck short-sleeve T-shirt for daily wear.'],
        ['panjabi', 'Cotton Panjabi', 'panjabi', 1650, 1900, 400, 'Cartix Studio', true,
            [['Off-white', '#EFE6D2', '#A07A3B']], ['M', 'L', 'XL'],
            'A knee-length panjabi with a band collar and contrast placket.'],
        ['borka', 'Abaya Borka', 'burqa', 2450, 2950, 700, 'Cartix Studio', true,
            [['Black', '#1B1B1F', '#B08D57']], ['50', '52', '54', '56'],
            'A full-length abaya with wide sleeves and contrast trim on the cuffs and front.'],
        ['borka', 'Embroidered Borka', 'burqa', 2650, null, 700, 'Cartix Studio', false,
            [['Navy', '#23324A', '#C9B37E']], ['52', '54', '56'],
            'A full-length borka with embroidered front panel and cuffs.'],
        ['three-piece', 'Cotton Three-piece', 'threepiece', 1850, 2200, 500, 'Cartix Studio', true,
            [['Maroon', '#7A1F2B', '#E3B04B']], ['M', 'L', 'XL'],
            'A three-piece set: long kameez with a bordered hem, matching trousers and a dupatta.'],
        ['three-piece', 'Lawn Three-piece', 'threepiece', 1950, null, 500, 'Cartix Studio', false,
            [['Teal', '#146C6C', '#F2C6A0']], ['M', 'L', 'XL'],
            'A lightweight three-piece set with a contrast dupatta.'],
        ['kurti', 'Printed Kurti', 'kurti', 990, 1150, 300, 'Cartix Basics', false,
            [['Mustard', '#C8962E', '#6B2C2C'], ['Rose', '#C76B8A', '#F5E3C8']], ['M', 'L', 'XL'],
            'A mid-length kurti with a printed yoke and side slits.'],
    ];

    private const RAIL_KINDS = ['hoodie', 'jacket', 'burqa', 'threepiece', 'kurti', 'panjabi', 'shirt', 'tshirt'];

    public function run(InventoryService $inventory, CheckoutService $checkout, OrderStatusService $status): void
    {
        $size = Attribute::query()->where('code', 'size')->firstOrFail();
        $color = Attribute::query()->where('code', 'color')->firstOrFail();
        $admin = User::role('super_admin')->firstOrFail();
        $disk = Storage::disk('public');

        $winter = ProductCollection::query()->updateOrCreate(['slug' => 'winter-collection'], [
            'name' => 'Winter Collection', 'type' => CollectionType::Rail, 'is_active' => true,
        ]);
        $essentials = ProductCollection::query()->updateOrCreate(['slug' => 'everyday-essentials'], [
            'name' => 'Everyday Essentials', 'type' => CollectionType::Section, 'is_active' => true,
        ]);

        mt_srand(42);
        $variantIds = [];
        foreach (self::CATALOG as $i => [$catSlug, $name, $kind, $price, $compare, $grams, $brandName, $featured, $colors, $sizes, $description]) {
            $kind = $kind === 't-shirt' ? 'tshirt' : $kind;
            $brand = Brand::query()->updateOrCreate(['slug' => Str::slug($brandName)], ['name' => $brandName, 'is_active' => true]);
            $slug = Str::slug($name);
            $product = Product::query()->updateOrCreate(['slug' => $slug], [
                'vendor_id' => Vendor::CARTIX_OFFICIAL_ID,
                'category_id' => Category::query()->where('slug', $catSlug)->value('id'),
                'brand_id' => $brand->id,
                'name' => $name,
                'short_description' => $description,
                'description' => $description."\n\nDemo product: the image is a generated illustration.",
                'status' => ProductStatus::Active,
                'is_featured' => $featured,
                'meta_title' => "{$name} | Cartix",
                'meta_description' => $description,
                'published_at' => now()->subDays(count(self::CATALOG) - $i),
            ]);

            $product->images()->delete();
            foreach ($colors as $c => [$colorName, $hex, $accent]) {
                $base = "demo/products/{$slug}-".Str::slug($colorName);
                $disk->put("{$base}-front.svg", GarmentSvg::gallery($kind, $hex, $accent, 'front'));
                $disk->put("{$base}-back.svg", GarmentSvg::gallery($kind, $hex, $accent, 'back'));
                $colorValueId = $color->values()->where('value', $colorName)->value('id');

                foreach ($sizes as $s) {
                    $variant = ProductVariant::query()->updateOrCreate(['sku' => strtoupper(Str::slug("{$name}-{$colorName}-{$s}"))], [
                        'product_id' => $product->id,
                        'price' => "{$price}.00",
                        'compare_at_price' => $compare ? "{$compare}.00" : null,
                        'cost_price' => (string) round($price * 0.6).'.00',
                        'weight_grams' => $grams,
                        'is_default' => $c === 0 && $s === $sizes[0],
                    ]);
                    $variant->attributeValues()->sync([$size->values()->where('value', $s)->value('id'), $colorValueId]);
                    if (! $variant->inventory) {
                        $inventory->adjust($variant->id, mt_rand(3, 25), StockMovementReason::Purchase, $admin->id, 'Opening stock');
                    }
                    $variantIds[] = $variant->id;

                    if ($s === $sizes[0]) {
                        foreach (['front' => 0, 'back' => 1] as $view => $order) {
                            ProductImage::query()->create([
                                'product_id' => $product->id, 'variant_id' => $variant->id, 'path' => "{$base}-{$view}.svg",
                                'alt' => "{$name} in {$colorName}, {$view} view", 'kind' => ProductImageKind::Gallery,
                                'sort_order' => $c * 10 + $order,
                            ]);
                        }
                    }
                }
            }

            // Hanging-rail artwork for the first color: transparent side, front and back views.
            [$colorName, $hex, $accent] = $colors[0];
            if (in_array($kind, self::RAIL_KINDS, true)) {
                foreach (['side' => ProductImageKind::RailSide, 'front' => ProductImageKind::RailFront, 'back' => ProductImageKind::RailBack] as $view => $imageKind) {
                    $path = "demo/rail/{$slug}-{$view}.svg";
                    $disk->put($path, GarmentSvg::rail($kind, $hex, $accent, $view));
                    ProductImage::query()->create([
                        'product_id' => $product->id, 'path' => $path, 'alt' => "{$name}, {$view} view on a hanger",
                        'kind' => $imageKind, 'sort_order' => 0,
                    ]);
                }
                $winter->products()->syncWithoutDetaching([$product->id => ['sort_order' => $i]]);
            }
            if (in_array($catSlug, ['t-shirts', 'shirts', 'kurti'], true)) {
                $essentials->products()->syncWithoutDetaching([$product->id => ['sort_order' => $i]]);
            }

            $product->refreshPriceRange();
        }

        $disk->put('demo/banners/winter-desktop.svg', $this->bannerSvg(1600, 560));
        $disk->put('demo/banners/winter-mobile.svg', $this->bannerSvg(800, 900));
        Banner::query()->updateOrCreate(['title' => 'Winter Collection'], [
            'image_desktop' => 'demo/banners/winter-desktop.svg',
            'image_mobile' => 'demo/banners/winter-mobile.svg',
            'link_url' => '/collections/winter-collection',
            'position' => 'home_hero',
            'sort_order' => 0,
            'is_active' => true,
        ]);

        if (Order::query()->exists()) {
            return;
        }

        $districts = District::query()->whereIn('name', ['Dhaka', 'Gazipur', 'Chattogram', 'Barguna', 'Rajshahi', 'Sylhet'])->get();
        $names = ['Rakib Hasan', 'Sabbir Ahmed', 'Nayeem Khan', 'Tanvir Rahman', 'Imran Sheikh', 'Fahim Islam', 'Sakib Hossain', 'Zubair Alam'];
        $plan = [
            VendorOrderStatus::Pending, VendorOrderStatus::Pending, VendorOrderStatus::Pending,
            VendorOrderStatus::Confirmed, VendorOrderStatus::Shipped, VendorOrderStatus::Shipped,
            VendorOrderStatus::Delivered, VendorOrderStatus::Delivered, VendorOrderStatus::Delivered,
            VendorOrderStatus::Cancelled, VendorOrderStatus::Returned,
        ];

        foreach ($plan as $i => $target) {
            $district = $districts[$i % $districts->count()];
            $phone = '0171'.str_pad((string) (2000000 + $i * 7919), 7, '0', STR_PAD_LEFT);
            $order = $checkout->place(new CheckoutData(
                items: [['variant_id' => $variantIds[($i * 7) % count($variantIds)], 'quantity' => 1 + $i % 2]],
                customerName: $names[$i % count($names)],
                customerPhone: $phone,
                customerEmail: null,
                recipientName: $names[$i % count($names)],
                recipientPhone: $phone,
                districtId: $district->id,
                upazilaId: null,
                addressLine: 'House '.(10 + $i).', Road '.(3 + $i % 5),
                postcode: null,
                paymentMethod: PaymentMethod::Cod,
            ));

            $vo = $order->vendorOrders->first();
            $path = match ($target) {
                VendorOrderStatus::Confirmed => [VendorOrderStatus::Confirmed],
                VendorOrderStatus::Shipped => [VendorOrderStatus::Confirmed, VendorOrderStatus::Shipped],
                VendorOrderStatus::Delivered => [VendorOrderStatus::Confirmed, VendorOrderStatus::Shipped, VendorOrderStatus::Delivered],
                VendorOrderStatus::Cancelled => [VendorOrderStatus::Cancelled],
                VendorOrderStatus::Returned => [VendorOrderStatus::Confirmed, VendorOrderStatus::Shipped, VendorOrderStatus::Returned],
                default => [],
            };
            foreach ($path as $step) {
                $vo = $status->transition($vo, $step, $admin);
            }

            // Spread demo orders over the past week so the dashboard chart has data.
            $order->forceFill(['created_at' => now()->subDays($i % 7)->subHours($i)])->saveQuietly();
        }
    }

    private function bannerSvg(int $w, int $h): string
    {
        $wide = $w > $h;
        $tx = $wide ? 96 : 64;
        $ty = $wide ? 220 : 160;
        $size = $wide ? 64 : 72;

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '.$w.' '.$h.'" width="'.$w.'" height="'.$h.'">'
            .'<rect width="'.$w.'" height="'.$h.'" fill="#0F172A"/>'
            .'<rect x="'.($wide ? $w * 0.56 : 0).'" y="'.($wide ? 0 : $h * 0.5).'" width="'.($wide ? $w * 0.44 : $w).'" height="'.($wide ? $h : $h * 0.5).'" fill="#1E293B"/>'
            .'<g transform="translate('.($wide ? $w * 0.68 : $w * 0.3).' '.($wide ? 40 : $h * 0.52).') scale('.($wide ? 1.5 : 1.25).')">'
            .strip_tags(GarmentSvg::rail('hoodie', '#2563EB', null), '<path><rect><g><circle><ellipse>')
            .'</g>'
            .'<text x="'.$tx.'" y="'.($ty - 70).'" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600" fill="#93C5FD" letter-spacing="3">NEW SEASON</text>'
            .'<text x="'.$tx.'" y="'.$ty.'" font-family="Inter, Arial, sans-serif" font-size="'.$size.'" font-weight="700" fill="#FFFFFF">Winter Collection</text>'
            .'<text x="'.$tx.'" y="'.($ty + 56).'" font-family="Inter, Arial, sans-serif" font-size="26" fill="#CBD5E1">Hoodies, jackets, borkas and three-piece sets.</text>'
            .'</svg>';
    }
}
