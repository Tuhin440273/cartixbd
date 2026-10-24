<?php

namespace App\Http\Controllers\Admin;

use App\Enums\ShippingZone;
use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\District;
use App\Models\Division;
use App\Models\ShippingRate;
use App\Services\Admin\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Delivery charges per zone and delivery coverage per district. The shop can start with Dhaka only
 * and switch on more districts later without any code or database change.
 */
class ShippingController extends Controller
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function index(): JsonResponse
    {
        $districtCounts = District::query()->selectRaw('shipping_zone, count(*) as total, sum(is_deliverable) as open')
            ->groupBy('shipping_zone')->get()->keyBy(fn ($r) => $r->shipping_zone instanceof ShippingZone ? $r->shipping_zone->value : $r->shipping_zone);

        return response()->json([
            'rates' => collect(ShippingZone::cases())->map(function (ShippingZone $zone) use ($districtCounts) {
                $rate = ShippingRate::query()->where('zone', $zone)->first();
                $counts = $districtCounts[$zone->value] ?? null;

                return [
                    'zone' => $zone->value,
                    'label' => $zone->label(),
                    'id' => $rate?->id,
                    'base_fee' => $rate?->base_fee,
                    'per_kg_fee' => $rate?->per_kg_fee,
                    'min_days' => $rate?->min_days,
                    'max_days' => $rate?->max_days,
                    'is_active' => (bool) ($rate?->is_active ?? false),
                    'districts' => (int) ($counts->total ?? 0),
                    'deliverable_districts' => (int) ($counts->open ?? 0),
                ];
            }),
            'divisions' => Division::query()->orderBy('name')->with(['districts' => fn ($q) => $q->orderBy('name')])->get()
                ->map(fn (Division $d) => [
                    'id' => $d->id,
                    'name' => $d->name,
                    'districts' => $d->districts->map(fn (District $x) => [
                        'id' => $x->id,
                        'name' => $x->name,
                        'shipping_zone' => $x->shipping_zone->value,
                        'is_deliverable' => $x->is_deliverable,
                    ]),
                ]),
            'zones' => ShippingZone::options(),
        ]);
    }

    /** Creates the zone's rate the first time it is saved. */
    public function updateRate(Request $request, string $zone): JsonResponse
    {
        $zoneEnum = ShippingZone::tryFrom($zone);
        abort_if($zoneEnum === null, 404, 'Unknown delivery zone.');
        $data = $request->validate([
            'base_fee' => ['required', 'decimal:0,2', 'min:0', 'max:100000'],
            'per_kg_fee' => ['required', 'decimal:0,2', 'min:0', 'max:100000'],
            'min_days' => ['required', 'integer', 'min:0', 'max:60'],
            'max_days' => ['required', 'integer', 'min:0', 'max:60', 'gte:min_days'],
            'is_active' => ['required', 'boolean'],
        ], ['max_days.gte' => 'The longest delivery time must be at least the shortest.']);

        $rate = ShippingRate::query()->updateOrCreate(['zone' => $zoneEnum], $data);
        $this->activity->log('shipping_rate.updated', $rate, [
            'zone' => $zoneEnum->value, 'base_fee' => (string) $rate->base_fee, 'is_active' => $rate->is_active,
        ]);

        return $this->index();
    }

    public function updateDistrict(Request $request, District $district): JsonResponse
    {
        $data = $request->validate([
            'is_deliverable' => ['required', 'boolean'],
            'shipping_zone' => ['required', Rule::enum(ShippingZone::class)],
        ]);
        $this->assertSomethingStaysOpen($data['is_deliverable'] ? [] : [$district->id]);
        $district->update($data);
        $this->activity->log('district.updated', $district, ['name' => $district->name, ...$data]);

        return $this->index();
    }

    /** Opens or closes delivery for many districts at once (for example "only Dhaka" during a pilot). */
    public function bulkDistricts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'district_ids' => ['required', 'array', 'min:1', 'max:64'],
            'district_ids.*' => ['integer', 'distinct', 'exists:districts,id'],
            'is_deliverable' => ['required', 'boolean'],
        ]);
        DB::transaction(function () use ($data) {
            if (! $data['is_deliverable']) {
                $this->assertSomethingStaysOpen($data['district_ids']);
            }
            District::query()->whereIn('id', $data['district_ids'])->update(['is_deliverable' => $data['is_deliverable']]);
        });
        $this->activity->log('districts.bulk_updated', null, ['count' => count($data['district_ids']), 'is_deliverable' => $data['is_deliverable']]);

        return $this->index();
    }

    /** @param  list<int>  $closing */
    private function assertSomethingStaysOpen(array $closing): void
    {
        if ($closing !== [] && ! District::query()->where('is_deliverable', true)->whereNotIn('id', $closing)->exists()) {
            throw new DomainRuleException('At least one district must stay open for delivery, or customers cannot order.');
        }
    }
}
