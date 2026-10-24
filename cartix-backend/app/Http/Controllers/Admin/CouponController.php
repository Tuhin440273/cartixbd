<?php

namespace App\Http\Controllers\Admin;

use App\Enums\CouponType;
use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Services\Admin\ActivityLogger;
use App\Support\ShopTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Platform coupons (funded by the shop). Checkout validates and applies them on the server. */
class CouponController extends Controller
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function index(): JsonResponse
    {
        $coupons = Coupon::query()->whereNull('vendor_id')
            ->withCount('usages')->withSum('usages', 'discount_amount')
            ->latest('id')->get();

        return response()->json(['data' => $coupons->map(fn (Coupon $c) => $this->row($c))]);
    }

    public function store(Request $request): JsonResponse
    {
        $coupon = Coupon::query()->create($this->validated($request));
        $this->activity->log('coupon.created', $coupon, ['code' => $coupon->code]);

        return response()->json(['data' => $this->row($coupon->loadCount('usages'))], 201);
    }

    public function update(Request $request, Coupon $coupon): JsonResponse
    {
        abort_if($coupon->vendor_id !== null, 404);
        $data = $this->validated($request, $coupon);
        if ($data['code'] !== $coupon->code && $coupon->usages()->exists()) {
            throw new DomainRuleException('This coupon has been used, so its code cannot be changed.');
        }
        $coupon->update($data);
        $this->activity->log('coupon.updated', $coupon, ['code' => $coupon->code, 'is_active' => $coupon->is_active]);

        return response()->json(['data' => $this->row($coupon->loadCount('usages')->loadSum('usages', 'discount_amount'))]);
    }

    public function destroy(Coupon $coupon): JsonResponse
    {
        abort_if($coupon->vendor_id !== null, 404);
        if ($coupon->usages()->exists()) {
            throw new DomainRuleException('This coupon has been used, so it is kept for the order records. Deactivate it instead.');
        }
        $coupon->delete();
        $this->activity->log('coupon.deleted', null, ['code' => $coupon->code]);

        return response()->json(['message' => 'Coupon deleted.']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Coupon $coupon = null): array
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        $type = $request->input('type');

        $data = $request->validate([
            'code' => ['required', 'string', 'regex:/^[A-Z0-9_-]{3,50}$/', Rule::unique('coupons', 'code')->ignore($coupon?->id)],
            'type' => ['required', Rule::enum(CouponType::class)],
            'value' => $type === CouponType::FreeShipping->value
                ? ['nullable']
                : ['required', 'decimal:0,2', 'gt:0', $type === CouponType::Percent->value ? 'max:100' : 'max:1000000'],
            'min_order_amount' => ['nullable', 'decimal:0,2', 'min:0', 'max:1000000'],
            'max_discount' => ['nullable', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'usage_limit' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'per_user_limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['required', 'boolean'],
        ], [
            'code.regex' => 'Use 3 to 50 capital letters, digits, hyphens or underscores.',
            'code.unique' => 'Another coupon already uses this code.',
            'value.max' => $type === CouponType::Percent->value ? 'A percentage cannot be more than 100.' : 'The value is too large.',
            'ends_at.after' => 'The end must be after the start.',
        ]);

        return [
            'code' => $data['code'],
            'type' => $data['type'],
            'value' => $data['type'] === CouponType::FreeShipping->value ? 0 : $data['value'],
            'min_order_amount' => $data['min_order_amount'] ?? 0,
            // A maximum only makes sense for percentage discounts.
            'max_discount' => $data['type'] === CouponType::Percent->value ? ($data['max_discount'] ?? null) : null,
            'usage_limit' => $data['usage_limit'] ?? null,
            'per_user_limit' => $data['per_user_limit'] ?? null,
            'starts_at' => ShopTime::fromInput($data['starts_at'] ?? null),
            'ends_at' => ShopTime::fromInput($data['ends_at'] ?? null),
            'is_active' => $data['is_active'],
        ];
    }

    /** @return array<string, mixed> */
    private function row(Coupon $c): array
    {
        $used = (int) ($c->usages_count ?? 0);
        $now = now();
        $state = match (true) {
            ! $c->is_active => 'inactive',
            $c->ends_at !== null && $c->ends_at < $now => 'expired',
            $c->starts_at !== null && $c->starts_at > $now => 'scheduled',
            $c->usage_limit !== null && $used >= $c->usage_limit => 'used_up',
            default => 'live',
        };

        return [
            'id' => $c->id,
            'code' => $c->code,
            'type' => $c->type->value,
            'type_label' => $c->type->label(),
            'value' => $c->value,
            'min_order_amount' => $c->min_order_amount,
            'max_discount' => $c->max_discount,
            'usage_limit' => $c->usage_limit,
            'per_user_limit' => $c->per_user_limit,
            'starts_at' => ShopTime::iso($c->starts_at),
            'ends_at' => ShopTime::iso($c->ends_at),
            'is_active' => $c->is_active,
            'times_used' => $used,
            'discount_given' => number_format((float) ($c->usages_sum_discount_amount ?? 0), 2, '.', ''),
            'state' => $state,
        ];
    }
}
