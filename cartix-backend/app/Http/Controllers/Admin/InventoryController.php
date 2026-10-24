<?php

namespace App\Http\Controllers\Admin;

use App\Enums\StockMovementReason;
use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Services\Admin\ActivityLogger;
use App\Services\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    private const AVAILABLE = 'coalesce(inventories.quantity, 0) - coalesce(inventories.reserved_quantity, 0)';

    public function __construct(
        private readonly InventoryService $inventory,
        private readonly ActivityLogger $activity,
    ) {}

    /** Every variant with on-hand, reserved and available stock; filter by name/SKU and stock state. */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'stock' => ['nullable', Rule::in(['in', 'low', 'out'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        // Left join: a variant without an inventory row simply has no stock.
        $query = ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('inventories', 'inventories.variant_id', '=', 'product_variants.id')
            ->whereNull('products.deleted_at')
            ->select('product_variants.*')
            ->with(['product:id,name,status', 'inventory', 'attributeValues'])
            ->orderByRaw(self::AVAILABLE)->orderBy('products.name')->orderBy('product_variants.id');

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(fn ($w) => $w->where('products.name', 'like', $like)->orWhere('product_variants.sku', 'like', $like));
        }
        match ($data['stock'] ?? null) {
            'out' => $query->whereRaw(self::AVAILABLE.' <= 0'),
            'low' => $query->whereRaw(self::AVAILABLE.' > 0 AND '.self::AVAILABLE.' <= coalesce(inventories.low_stock_threshold, 5)'),
            'in' => $query->whereRaw(self::AVAILABLE.' > 0'),
            default => null,
        };

        $page = $query->paginate(30);

        return response()->json([
            'data' => collect($page->items())->map(function (ProductVariant $v) {
                $available = $v->inventory?->available() ?? 0;
                $threshold = $v->inventory?->low_stock_threshold ?? 5;

                return [
                    'variant_id' => $v->id,
                    'product_id' => $v->product_id,
                    'product' => $v->product->name,
                    'product_status' => $v->product->status->value,
                    'variant' => $v->label(),
                    'sku' => $v->sku,
                    'is_active' => $v->is_active,
                    'quantity' => $v->inventory?->quantity ?? 0,
                    'reserved' => $v->inventory?->reserved_quantity ?? 0,
                    'available' => $available,
                    'threshold' => $threshold,
                    'state' => $available <= 0 ? 'out' : ($available <= $threshold ? 'low' : 'in'),
                ];
            }),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    /** Adjust stock for new purchases or stock counts; every change is logged in stock_movements. */
    public function adjust(Request $request, ProductVariant $variant): JsonResponse
    {
        $data = $request->validate([
            'change' => ['required', 'integer', 'not_in:0', 'min:-10000', 'max:10000'],
            'reason' => ['required', Rule::in([StockMovementReason::Purchase->value, StockMovementReason::Adjustment->value])],
            'note' => ['nullable', 'string', 'max:300'],
        ]);
        if ($data['reason'] === StockMovementReason::Purchase->value && (int) $data['change'] < 0) {
            return response()->json([
                'message' => 'A purchase adds stock. Use a stock count correction to remove stock.',
                'errors' => ['change' => ['A purchase adds stock. Use a stock count correction to remove stock.']],
            ], 422);
        }

        $inv = $this->inventory->adjust($variant->id, (int) $data['change'], StockMovementReason::from($data['reason']),
            $request->user()->id, $data['note'] ?? null);
        $this->activity->log('stock.adjusted', $variant, ['sku' => $variant->sku, 'change' => (int) $data['change'], 'reason' => $data['reason']]);

        return response()->json(['data' => [
            'variant_id' => $variant->id,
            'quantity' => $inv->quantity,
            'reserved' => $inv->reserved_quantity,
            'available' => $inv->available(),
        ]]);
    }

    /** Stock history of one variant, newest first. */
    public function movements(ProductVariant $variant): JsonResponse
    {
        $rows = StockMovement::query()->with('user:id,name')->where('variant_id', $variant->id)
            ->latest('id')->limit(100)->get();

        return response()->json(['data' => $rows->map(fn (StockMovement $m) => [
            'id' => $m->id,
            'change' => $m->change,
            'quantity_before' => $m->quantity_before,
            'quantity_after' => $m->quantity_after,
            'reason' => $m->reason->value,
            'reason_label' => $m->reason->label(),
            'note' => $m->note,
            'by' => $m->user?->name,
            'at' => $m->created_at?->toIso8601String(),
        ])]);
    }

    public function lowStock(): JsonResponse
    {
        $rows = Inventory::query()
            ->with('variant.product', 'variant.attributeValues')
            ->whereHas('variant', fn ($v) => $v->where('is_active', true)->whereHas('product'))
            ->whereRaw('quantity - reserved_quantity <= low_stock_threshold')
            ->orderByRaw('quantity - reserved_quantity')
            ->limit(100)
            ->get();

        return response()->json(['data' => $rows->map(fn (Inventory $i) => [
            'variant_id' => $i->variant_id,
            'product' => $i->variant->product->name,
            'variant' => $i->variant->label(),
            'sku' => $i->variant->sku,
            'available' => $i->available(),
            'threshold' => $i->low_stock_threshold,
        ])]);
    }
}
