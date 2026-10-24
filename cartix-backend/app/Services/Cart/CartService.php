<?php

namespace App\Services\Cart;

use App\Enums\ProductImageKind;
use App\Enums\ProductStatus;
use App\Enums\VendorStatus;
use App\Exceptions\DomainRuleException;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\ProductVariant;
use App\Services\Checkout\CheckoutService;
use App\Support\Media;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Guest carts. The client holds a random token; the database stores only its SHA-256 hash,
 * so a leaked database row cannot be used to take over a cart. Prices are never stored as the
 * source of truth: the current variant price is always used, and the price seen when the item
 * was added is kept only to tell the customer that it changed.
 */
final class CartService
{
    public function __construct(private readonly CheckoutService $checkout) {}

    /** @return array{0: Cart, 1: string} the new cart and its plain token (shown to the client once) */
    public function create(): array
    {
        $token = bin2hex(random_bytes(32));
        $cart = Cart::query()->create([
            'session_token' => self::hash($token),
            'expires_at' => now()->addDays((int) config('cartix.cart_lifetime_days', 30)),
        ]);

        return [$cart, $token];
    }

    public function find(?string $token): ?Cart
    {
        if ($token === null || ! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }

        return Cart::query()->where('session_token', self::hash($token))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->first();
    }

    public function add(Cart $cart, int $variantId, int $quantity): void
    {
        DB::transaction(function () use ($cart, $variantId, $quantity) {
            $this->lock($cart);
            $variant = $this->sellableVariant($variantId);
            $item = CartItem::query()->where('cart_id', $cart->id)->where('variant_id', $variantId)->first();
            $newQty = ($item?->quantity ?? 0) + $quantity;
            $this->assertQuantity($variant, $newQty);

            CartItem::query()->updateOrCreate(
                ['cart_id' => $cart->id, 'variant_id' => $variantId],
                ['quantity' => $newQty, 'unit_price_at_add' => $item?->unit_price_at_add ?? $variant->price],
            );
            $this->touch($cart);
        });
    }

    public function update(Cart $cart, CartItem $item, int $quantity): void
    {
        DB::transaction(function () use ($cart, $item, $quantity) {
            $this->lock($cart);
            $this->assertQuantity($this->sellableVariant($item->variant_id), $quantity);
            // Accepting the new quantity also accepts the current price.
            $item->update(['quantity' => $quantity, 'unit_price_at_add' => ProductVariant::query()->whereKey($item->variant_id)->value('price')]);
            $this->touch($cart);
        });
    }

    public function remove(Cart $cart, CartItem $item): void
    {
        DB::transaction(function () use ($cart, $item) {
            $this->lock($cart);
            $item->delete();
            $this->touch($cart);
        });
    }

    public function clear(Cart $cart): void
    {
        DB::transaction(function () use ($cart) {
            $this->lock($cart);
            $cart->items()->delete();
            $this->touch($cart);
        });
    }

    /**
     * Cart contents with current prices and any problems that block checkout,
     * plus a server-side quote when a district is given.
     *
     * @return array<string, mixed>
     */
    public function summary(Cart $cart, ?int $districtId = null, ?string $couponCode = null): array
    {
        $items = $cart->items()->with([
            'variant' => fn ($q) => $q->withTrashed(),
            'variant.inventory', 'variant.attributeValues',
            'variant.product' => fn ($q) => $q->withTrashed(),
            'variant.product.vendor', 'variant.images', 'variant.product.images',
        ])->orderBy('id')->get();

        $lines = [];
        $subtotal = 0;
        $valid = [];
        foreach ($items as $item) {
            $variant = $item->variant;
            $product = $variant?->product;
            $sellable = $variant !== null && $variant->deleted_at === null && $variant->is_active
                && $product !== null && $product->deleted_at === null && $product->status === ProductStatus::Active
                && $product->vendor?->status === VendorStatus::Approved;
            $available = $sellable ? ($variant->inventory?->available() ?? 0) : 0;

            $issue = match (true) {
                ! $sellable => 'unavailable',
                $available < 1 => 'out_of_stock',
                $item->quantity > $available => 'insufficient_stock',
                default => null,
            };
            $priceChanged = $sellable && $item->unit_price_at_add !== null
                && Money::toPoisha((string) $item->unit_price_at_add) !== Money::toPoisha((string) $variant->price);

            $unit = $sellable ? Money::toPoisha((string) $variant->price) : 0;
            $lineTotal = $unit * $item->quantity;
            if ($issue === null) {
                $subtotal += $lineTotal;
                $valid[] = ['variant_id' => $variant->id, 'quantity' => $item->quantity];
            }

            $image = $variant?->images->where('kind', ProductImageKind::Gallery)->sortBy('sort_order')->first()
                ?? $product?->images->where('kind', ProductImageKind::Gallery)->sortBy('sort_order')->first();

            $lines[] = [
                'id' => $item->id,
                'variant_id' => $item->variant_id,
                'product' => $product ? ['name' => $product->name, 'slug' => $product->slug] : null,
                'variant_label' => $variant?->label() ?: null,
                'image' => $image ? ['url' => Media::url($image->path), 'alt' => $image->alt ?? ''] : null,
                'quantity' => $item->quantity,
                'unit_price' => $sellable ? Money::toDecimal($unit) : null,
                'previous_unit_price' => $priceChanged ? (string) $item->unit_price_at_add : null,
                'line_total' => $sellable ? Money::toDecimal($lineTotal) : null,
                'max_quantity' => min($available, CheckoutService::MAX_QUANTITY_PER_LINE),
                'issue' => $issue,
                'issue_message' => match ($issue) {
                    'unavailable' => 'This item is no longer available. Please remove it.',
                    'out_of_stock' => 'This item is out of stock. Please remove it.',
                    'insufficient_stock' => "Only {$available} left in stock. Please reduce the quantity.",
                    default => $priceChanged ? 'The price of this item has changed since you added it.' : null,
                },
            ];
        }

        $hasIssues = collect($lines)->contains(fn ($l) => $l['issue'] !== null);
        $summary = [
            'item_count' => array_sum(array_column(array_filter($lines, fn ($l) => $l['issue'] === null), 'quantity')),
            'items' => $lines,
            'subtotal' => Money::toDecimal($subtotal),
            'has_issues' => $hasIssues,
            'can_checkout' => $valid !== [] && ! $hasIssues,
            'quote' => null,
            'coupon' => null,
        ];

        if ($districtId !== null && $valid !== []) {
            $summary['quote'] = $this->quote($valid, $districtId, null);
            if ($couponCode !== null && trim($couponCode) !== '') {
                try {
                    $summary['quote'] = $this->quote($valid, $districtId, $couponCode);
                    $summary['coupon'] = ['code' => strtoupper(trim($couponCode)), 'applied' => true, 'message' => 'Coupon applied.'];
                } catch (DomainRuleException $e) {
                    $summary['coupon'] = ['code' => strtoupper(trim($couponCode)), 'applied' => false, 'message' => $e->getMessage()];
                }
            }
        }

        return $summary;
    }

    /**
     * @param  list<array{variant_id:int, quantity:int}>  $items
     * @return array<string, string>
     */
    private function quote(array $items, int $districtId, ?string $couponCode): array
    {
        $price = $this->checkout->quote($items, $districtId, $couponCode)->price;

        return [
            'subtotal' => Money::toDecimal($price->subtotal),
            'discount' => Money::toDecimal($price->discountTotal),
            'shipping' => Money::toDecimal($price->shippingTotal),
            'shipping_discount' => Money::toDecimal($price->shippingDiscount),
            'total' => Money::toDecimal($price->grandTotal),
        ];
    }

    private function sellableVariant(int $variantId): ProductVariant
    {
        $variant = ProductVariant::query()->with(['product.vendor', 'inventory'])->where('is_active', true)->find($variantId);
        if ($variant === null || $variant->product?->status !== ProductStatus::Active
            || $variant->product->vendor?->status !== VendorStatus::Approved) {
            throw new DomainRuleException('This item is not available.');
        }

        return $variant;
    }

    private function assertQuantity(ProductVariant $variant, int $quantity): void
    {
        if ($quantity < 1 || $quantity > CheckoutService::MAX_QUANTITY_PER_LINE) {
            throw new DomainRuleException('Quantity must be between 1 and '.CheckoutService::MAX_QUANTITY_PER_LINE.'.');
        }
        $available = $variant->inventory?->available() ?? 0;
        if ($available < 1) {
            throw new DomainRuleException('This item is out of stock.');
        }
        if ($quantity > $available) {
            throw new DomainRuleException("Only {$available} left in stock.");
        }
    }

    private function lock(Cart $cart): void
    {
        Cart::query()->whereKey($cart->id)->lockForUpdate()->first();
    }

    private function touch(Cart $cart): void
    {
        $cart->forceFill(['expires_at' => now()->addDays((int) config('cartix.cart_lifetime_days', 30))])->save();
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
