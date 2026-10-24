<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\District;
use App\Models\Division;
use App\Models\ShippingRate;
use App\Models\Upazila;
use Illuminate\Http\JsonResponse;

class LocationController extends Controller
{
    /** Divisions with their districts and each district's delivery zone. */
    public function divisions(): JsonResponse
    {
        // Only districts the shop currently delivers to; divisions without any are left out.
        $divisions = Division::query()->orderBy('name')
            ->with(['districts' => fn ($q) => $q->where('is_deliverable', true)->orderBy('name')])->get()
            ->filter(fn (Division $d) => $d->districts->isNotEmpty())->values();

        return response()->json(['data' => $divisions->map(fn (Division $d) => [
            'id' => $d->id,
            'name' => $d->name,
            'districts' => $d->districts->map(fn (District $x) => [
                'id' => $x->id, 'name' => $x->name, 'shipping_zone' => $x->shipping_zone->value,
            ]),
        ])]);
    }

    public function upazilas(District $district): JsonResponse
    {
        return response()->json(['data' => Upazila::query()->where('district_id', $district->id)
            ->orderBy('name')->get(['id', 'name'])]);
    }

    public function shippingRates(): JsonResponse
    {
        return response()->json(['data' => ShippingRate::query()->where('is_active', true)->orderBy('base_fee')->get()
            ->map(fn (ShippingRate $r) => [
                'zone' => $r->zone->value,
                'label' => $r->zone->label(),
                'base_fee' => $r->base_fee,
                'per_kg_fee' => $r->per_kg_fee,
                'min_days' => $r->min_days,
                'max_days' => $r->max_days,
            ])]);
    }
}
