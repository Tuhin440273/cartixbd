<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PaymentMethod;
use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\OrderPresenter;
use App\Models\Cart;
use App\Models\Order;
use App\Services\Cart\CartService;
use App\Services\Checkout\CheckoutData;
use App\Services\Checkout\CheckoutService;
use App\Support\Money;
use App\Support\Phone;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Guest checkout from the server-side cart. Prices, discounts and shipping are always
 * recalculated by CheckoutService; the client's numbers are only used to detect that the
 * total the customer confirmed is no longer current.
 */
class CheckoutController extends Controller
{
    public function __construct(
        private readonly CartService $carts,
        private readonly CheckoutService $checkout,
    ) {}

    public function options(): JsonResponse
    {
        return response()->json(['data' => [
            'payment_methods' => self::paymentMethods()->map(fn (PaymentMethod $m) => [
                'code' => $m->value, 'label' => $m->label(),
            ])->values(),
            'max_quantity_per_item' => CheckoutService::MAX_QUANTITY_PER_LINE,
            'requires_terms' => true,
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $key = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9_-]{16,64}$/', $key)) {
            return response()->json([
                'message' => 'A valid Idempotency-Key header (16 to 64 letters, digits, "-" or "_") is required.',
            ], 400);
        }

        $phoneRule = function (string $attribute, mixed $value, Closure $fail) {
            if (! is_string($value) || ! Phone::isValid($value)) {
                $fail('Please enter a valid Bangladeshi mobile number, for example 01712345678.');
            }
        };
        $v = $request->validate([
            'customer_name' => ['required', 'string', 'min:2', 'max:100'],
            'customer_phone' => ['required', 'string', 'max:20', $phoneRule],
            'customer_email' => ['nullable', 'email:rfc', 'max:150'],
            'recipient_name' => ['nullable', 'string', 'min:2', 'max:100'],
            'recipient_phone' => ['nullable', 'string', 'max:20', $phoneRule],
            'district_id' => ['required', 'integer', 'exists:districts,id'],
            'upazila_id' => ['nullable', 'integer', 'exists:upazilas,id'],
            'area_name' => ['nullable', 'required_without:upazila_id', 'string', 'min:2', 'max:100'],
            'address_line' => ['required', 'string', 'min:5', 'max:255'],
            'postcode' => ['nullable', 'string', 'regex:/^\d{4}$/'],
            'note' => ['nullable', 'string', 'max:500'],
            'coupon_code' => ['nullable', 'string', 'max:50'],
            'payment_method' => ['required', Rule::in(self::paymentMethods()->map->value->all())],
            'accept_terms' => ['accepted'],
            'expected_total' => ['nullable', 'numeric', 'min:0'],
        ], [
            'area_name.required_without' => 'Please enter your area, upazila or thana.',
            'payment_method.in' => 'This payment method is not available.',
            'accept_terms.accepted' => 'Please confirm that your order details are correct.',
            'postcode.regex' => 'The postcode must be 4 digits.',
            'district_id.exists' => 'Please choose a valid district.',
        ]);

        $cart = $this->carts->find($request->header(CartController::HEADER));
        abort_if($cart === null, 404, 'Your cart was not found or has expired.');

        // The key is bound to this cart, so a key can never return someone else's order.
        $checkoutKey = hash('sha256', $cart->id.':'.$key);
        $accessToken = hash_hmac('sha256', 'order-access:'.$checkoutKey, (string) config('app.key'));

        $result = DB::transaction(function () use ($cart, $checkoutKey, $accessToken, $v, $request) {
            // Serialize checkouts of the same cart: a double click waits here, then finds the first order.
            Cart::query()->whereKey($cart->id)->lockForUpdate()->first();

            $existing = Order::query()->where('checkout_key', $checkoutKey)->first();
            if ($existing !== null) {
                return [$existing, false];
            }

            $items = $cart->items()->get(['variant_id', 'quantity'])
                ->map(fn ($i) => ['variant_id' => (int) $i->variant_id, 'quantity' => (int) $i->quantity])->all();
            if ($items === []) {
                throw new DomainRuleException('Your cart is empty.');
            }

            if (isset($v['expected_total'])) {
                $quote = $this->checkout->quote($items, (int) $v['district_id'], $v['coupon_code'] ?? null, $v['customer_phone']);
                if ($quote->price->grandTotal !== Money::toPoisha((string) $v['expected_total'])) {
                    return [null, Money::toDecimal($quote->price->grandTotal)];
                }
            }

            $order = $this->checkout->place(new CheckoutData(
                items: $items,
                customerName: trim($v['customer_name']),
                customerPhone: $v['customer_phone'],
                customerEmail: $v['customer_email'] ?? null,
                recipientName: trim($v['recipient_name'] ?? $v['customer_name']),
                recipientPhone: $v['recipient_phone'] ?? $v['customer_phone'],
                districtId: (int) $v['district_id'],
                upazilaId: isset($v['upazila_id']) ? (int) $v['upazila_id'] : null,
                addressLine: trim($v['address_line']),
                postcode: $v['postcode'] ?? null,
                paymentMethod: PaymentMethod::from($v['payment_method']),
                couponCode: $v['coupon_code'] ?? null,
                note: isset($v['note']) ? trim($v['note']) : null,
                ipAddress: $request->ip(),
                areaName: $v['area_name'] ?? null,
                checkoutKey: $checkoutKey,
                accessToken: $accessToken,
            ));
            $cart->items()->delete();

            return [$order, true];
        });

        [$order, $created] = $result;
        if ($order === null) {
            return response()->json([
                'message' => 'Prices or delivery charges have changed. Please review the new total and confirm again.',
                'code' => 'total_changed',
                'total' => $created,
            ], 409);
        }

        return response()->json([
            'data' => OrderPresenter::present($order->fresh(), full: true),
            'access_token' => $accessToken,
            'replayed' => ! $created,
        ], $created ? 201 : 200)->header('Cache-Control', 'no-store, private');
    }

    /** @return Collection<int, PaymentMethod> */
    public static function paymentMethods(): Collection
    {
        return collect(config('cartix.payment_methods'))
            ->map(fn ($m) => PaymentMethod::tryFrom((string) $m))
            ->filter()->values();
    }
}
