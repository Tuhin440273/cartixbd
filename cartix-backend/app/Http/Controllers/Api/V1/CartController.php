<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Services\Cart\CartService;
use App\Services\Checkout\CheckoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Guest cart. The cart is identified by the X-Cart-Token header. Adding the first item without a
 * token creates a cart; the new token is returned once in "cart_token" and must be stored by the
 * client (the storefront keeps it in an httpOnly cookie).
 */
class CartController extends Controller
{
    public const HEADER = 'X-Cart-Token';

    public function __construct(private readonly CartService $carts) {}

    public function show(Request $request): JsonResponse
    {
        $q = $request->validate([
            'district_id' => ['nullable', 'integer', 'exists:districts,id'],
            'coupon_code' => ['nullable', 'string', 'max:50'],
        ]);
        $cart = $this->carts->find($request->header(self::HEADER));
        if ($cart === null) {
            return $this->noStore(response()->json(['data' => self::emptyCart()]));
        }

        return $this->respond($cart, $q['district_id'] ?? null, $q['coupon_code'] ?? null);
    }

    public function addItem(Request $request): JsonResponse
    {
        $v = $request->validate([
            'variant_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'integer', 'min:1', 'max:'.CheckoutService::MAX_QUANTITY_PER_LINE],
        ]);

        $newToken = null;
        $cart = $this->carts->find($request->header(self::HEADER));
        if ($cart === null) {
            [$cart, $newToken] = $this->carts->create();
        }
        $this->carts->add($cart, (int) $v['variant_id'], (int) $v['quantity']);

        return $this->respond($cart, null, null, $newToken, 201);
    }

    public function updateItem(Request $request, int $item): JsonResponse
    {
        $v = $request->validate([
            'quantity' => ['required', 'integer', 'min:1', 'max:'.CheckoutService::MAX_QUANTITY_PER_LINE],
        ]);
        [$cart, $line] = $this->ownedItem($request, $item);
        $this->carts->update($cart, $line, (int) $v['quantity']);

        return $this->respond($cart);
    }

    public function removeItem(Request $request, int $item): JsonResponse
    {
        [$cart, $line] = $this->ownedItem($request, $item);
        $this->carts->remove($cart, $line);

        return $this->respond($cart);
    }

    public function clear(Request $request): JsonResponse
    {
        $cart = $this->requireCart($request);
        $this->carts->clear($cart);

        return $this->respond($cart);
    }

    /** @return array{0: Cart, 1: CartItem} */
    private function ownedItem(Request $request, int $itemId): array
    {
        $cart = $this->requireCart($request);
        // Scoped to the caller's cart: another cart's item id gives the same 404 as a missing one.
        $item = CartItem::query()->where('cart_id', $cart->id)->find($itemId);
        abort_if($item === null, 404, 'This item is not in your cart.');

        return [$cart, $item];
    }

    private function requireCart(Request $request): Cart
    {
        $cart = $this->carts->find($request->header(self::HEADER));
        abort_if($cart === null, 404, 'Your cart was not found or has expired.');

        return $cart;
    }

    private function respond(Cart $cart, ?int $districtId = null, ?string $coupon = null, ?string $newToken = null, int $status = 200): JsonResponse
    {
        $body = ['data' => $this->carts->summary($cart, $districtId, $coupon)];
        if ($newToken !== null) {
            $body['cart_token'] = $newToken;
        }

        return $this->noStore(response()->json($body, $status));
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        // Carts are private: never cache them in a browser or a shared cache.
        return $response->header('Cache-Control', 'no-store, private');
    }

    /** @return array<string, mixed> */
    public static function emptyCart(): array
    {
        return [
            'item_count' => 0, 'items' => [], 'subtotal' => '0.00', 'has_issues' => false,
            'can_checkout' => false, 'quote' => null, 'coupon' => null,
        ];
    }
}
