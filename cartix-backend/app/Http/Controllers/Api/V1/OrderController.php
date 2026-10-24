<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\OrderPresenter;
use App\Models\Order;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Guest order access: by the secret token issued at checkout, or by order number plus phone. */
class OrderController extends Controller
{
    public const TOKEN_HEADER = 'X-Order-Token';

    private const NOT_FOUND = 'We could not find an order with these details.';

    public function show(Request $request, string $number): JsonResponse
    {
        $order = Order::query()->where('order_number', $number)->first();
        // Same response for "no such order" and "wrong token", so order numbers cannot be probed.
        abort_if($order === null || ! $order->accessTokenMatches($request->header(self::TOKEN_HEADER)), 404, self::NOT_FOUND);

        return response()->json(['data' => OrderPresenter::present($order, full: true)])
            ->header('Cache-Control', 'no-store, private');
    }

    public function lookup(Request $request): JsonResponse
    {
        $v = $request->validate([
            'order_number' => ['required', 'string', 'max:30'],
            'phone' => ['required', 'string', 'max:20'],
        ]);

        $order = Order::query()->where('order_number', strtoupper(trim($v['order_number'])))->first();
        $phone = Phone::isValid($v['phone']) ? Phone::normalize($v['phone']) : null;
        $matches = $order !== null && $phone !== null
            && (hash_equals($order->customer_phone, $phone) || hash_equals((string) $order->ship_phone, $phone));
        abort_if(! $matches, 404, self::NOT_FOUND);

        // Knowing a phone number is weaker proof than holding the token: return a masked view.
        return response()->json(['data' => OrderPresenter::present($order, full: false)])
            ->header('Cache-Control', 'no-store, private');
    }
}
