<?php

namespace App\Http\Controllers\Admin;

use App\Enums\OrderStatus;
use App\Enums\ProductStatus;
use App\Enums\VendorOrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use Illuminate\Http\JsonResponse;

/** Lists for forms and filters: categories, sizes, colors and status labels. */
class MetaController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $attributes = Attribute::query()->with(['values' => fn ($q) => $q->orderBy('sort_order')])->get()->keyBy('code');

        return response()->json([
            'categories' => Category::query()->where('is_active', true)->orderBy('parent_id')->orderBy('sort_order')
                ->get(['id', 'parent_id', 'name']),
            'brands' => Brand::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'sizes' => $attributes['size']?->values->map->only(['id', 'value']) ?? [],
            'colors' => $attributes['color']?->values->map->only(['id', 'value', 'color_hex']) ?? [],
            // Lets forms create a new color value (POST /attributes/{id}/values).
            'color_attribute_id' => $attributes['color']?->id,
            'order_statuses' => OrderStatus::options(),
            'vendor_order_statuses' => VendorOrderStatus::options(),
            'product_statuses' => ProductStatus::options(),
        ]);
    }
}
