<?php

use App\Http\Controllers\Admin\ActivityController;
use App\Http\Controllers\Admin\AttributeController;
use App\Http\Controllers\Admin\AuthController;
use App\Http\Controllers\Admin\BrandController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\CouponController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\InventoryController;
use App\Http\Controllers\Admin\MetaController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\ReportController;
use App\Http\Controllers\Admin\ShippingController;
use App\Http\Controllers\Admin\StaffController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\HomeController;
use App\Http\Controllers\Api\V1\LocationController;
use App\Http\Controllers\Api\V1\OrderController as CustomerOrderController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->group(function () {
    // Five login attempts per minute, to slow down password guessing.
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');

    // "staff" re-checks on every request that the account is active and still has an admin role.
    Route::middleware(['auth:sanctum', 'staff', 'throttle:120,1'])->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('meta', MetaController::class)->middleware('permission:dashboard.view');

        Route::get('dashboard', DashboardController::class)->middleware('permission:dashboard.view');

        // Orders
        Route::middleware('permission:orders.view')->group(function () {
            Route::get('orders', [OrderController::class, 'index']);
            Route::get('orders/{order}', [OrderController::class, 'show']);
        });
        Route::middleware('permission:orders.manage')->group(function () {
            Route::post('orders/{order}/confirm', [OrderController::class, 'confirm']);
            Route::post('orders/{order}/cancel', [OrderController::class, 'cancel']);
            Route::post('vendor-orders/{vendorOrder}/status', [OrderController::class, 'changeStatus']);
        });

        // Customers (built from orders; checkout is guest-only)
        Route::middleware('permission:customers.view')->group(function () {
            Route::get('customers', [CustomerController::class, 'index']);
            Route::get('customers/{phone}', [CustomerController::class, 'show'])->where('phone', '[0-9+]{10,15}');
        });

        // Catalog: read
        Route::middleware('permission:products.view')->group(function () {
            Route::get('products', [ProductController::class, 'index']);
            Route::get('products/{product}', [ProductController::class, 'show']);
            Route::get('inventory', [InventoryController::class, 'index']);
            Route::get('inventory/low-stock', [InventoryController::class, 'lowStock']);
            Route::get('variants/{variant}/movements', [InventoryController::class, 'movements']);
        });

        // Catalog: write
        Route::middleware('permission:products.manage')->group(function () {
            Route::post('products', [ProductController::class, 'store']);
            Route::put('products/{product}', [ProductController::class, 'update']);
            Route::patch('products/{product}/status', [ProductController::class, 'updateStatus']);
            Route::delete('products/{product}', [ProductController::class, 'destroy']);
            Route::post('products/{product}/variants', [ProductController::class, 'storeVariant']);
            Route::post('products/{product}/colors', [ProductController::class, 'storeColor']);
            Route::put('variants/{variant}', [ProductController::class, 'updateVariant']);
            Route::post('products/{product}/images', [ProductController::class, 'storeImage']);
            Route::put('products/{product}/images/order', [ProductController::class, 'reorderImages']);
            Route::put('images/{image}', [ProductController::class, 'updateImage']);
            Route::delete('images/{image}', [ProductController::class, 'destroyImage']);

            Route::get('categories', [CategoryController::class, 'index']);
            Route::post('categories', [CategoryController::class, 'store']);
            // POST, because browsers can only send file uploads with POST.
            Route::post('categories/{category}', [CategoryController::class, 'update']);
            Route::delete('categories/{category}', [CategoryController::class, 'destroy']);
            Route::get('brands', [BrandController::class, 'index']);
            Route::post('brands', [BrandController::class, 'store']);
            Route::post('brands/{brand}', [BrandController::class, 'update']);
            Route::delete('brands/{brand}', [BrandController::class, 'destroy']);

            Route::get('attributes', [AttributeController::class, 'index']);
            Route::post('attributes/{attribute}/values', [AttributeController::class, 'store']);
            Route::put('attribute-values/{value}', [AttributeController::class, 'update']);
            Route::delete('attribute-values/{value}', [AttributeController::class, 'destroy']);
        });

        Route::post('variants/{variant}/stock', [InventoryController::class, 'adjust'])->middleware('permission:inventory.manage');

        // Marketing
        Route::middleware('permission:coupons.manage')->group(function () {
            Route::get('coupons', [CouponController::class, 'index']);
            Route::post('coupons', [CouponController::class, 'store']);
            Route::put('coupons/{coupon}', [CouponController::class, 'update']);
            Route::delete('coupons/{coupon}', [CouponController::class, 'destroy']);
        });

        Route::get('reports/sales', [ReportController::class, 'sales'])->middleware('permission:reports.view');

        // System
        Route::middleware('permission:settings.manage')->group(function () {
            Route::get('shipping', [ShippingController::class, 'index']);
            Route::put('shipping/rates/{zone}', [ShippingController::class, 'updateRate']);
            Route::put('shipping/districts/{district}', [ShippingController::class, 'updateDistrict']);
            Route::post('shipping/districts/bulk', [ShippingController::class, 'bulkDistricts']);
        });
        Route::middleware('permission:staff.manage')->group(function () {
            Route::get('staff', [StaffController::class, 'index']);
            Route::post('staff', [StaffController::class, 'store']);
            Route::put('staff/{user}', [StaffController::class, 'update']);
            Route::put('staff/{user}/password', [StaffController::class, 'resetPassword']);
        });
        Route::get('activity', [ActivityController::class, 'index'])->middleware('permission:activity.view');
    });
});

/*
| Customer storefront API (public, guest checkout). See docs/API.md.
*/
Route::prefix('v1')->group(function () {
    Route::middleware('throttle:storefront')->group(function () {
        Route::get('home', HomeController::class);
        Route::get('categories', [CatalogController::class, 'categories']);
        Route::get('categories/{slug}', [CatalogController::class, 'category']);
        Route::get('brands', [CatalogController::class, 'brands']);
        Route::get('products', [CatalogController::class, 'products']);
        Route::get('products/{slug}', [CatalogController::class, 'product']);

        Route::get('locations/divisions', [LocationController::class, 'divisions']);
        Route::get('locations/districts/{district}/upazilas', [LocationController::class, 'upazilas']);
        Route::get('shipping/rates', [LocationController::class, 'shippingRates']);

        Route::get('cart', [CartController::class, 'show']);
        Route::post('cart/items', [CartController::class, 'addItem']);
        Route::patch('cart/items/{item}', [CartController::class, 'updateItem'])->whereNumber('item');
        Route::delete('cart/items/{item}', [CartController::class, 'removeItem'])->whereNumber('item');
        Route::delete('cart', [CartController::class, 'clear']);

        Route::get('checkout/options', [CheckoutController::class, 'options']);
        Route::get('orders/{number}', [CustomerOrderController::class, 'show']);
    });

    Route::post('checkout', [CheckoutController::class, 'store'])->middleware('throttle:checkout');
    Route::post('orders/lookup', [CustomerOrderController::class, 'lookup'])->middleware('throttle:order-lookup');
});
