<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Product;
use App\Services\Admin\ActivityLogger;
use App\Services\Admin\ImageStore;
use App\Support\Media;
use App\Support\Slug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BrandController extends Controller
{
    public function __construct(private readonly ActivityLogger $activity, private readonly ImageStore $images) {}

    public function index(): JsonResponse
    {
        $counts = Product::query()->whereNotNull('brand_id')->selectRaw('brand_id, count(*) as total')
            ->groupBy('brand_id')->pluck('total', 'brand_id');

        return response()->json(['data' => Brand::query()->orderBy('name')->get()
            ->map(fn (Brand $b) => $this->row($b, (int) ($counts[$b->id] ?? 0)))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $brand = Brand::query()->create([
            'name' => $data['name'],
            'is_active' => $data['is_active'],
            'slug' => Slug::unique(Brand::class, $data['name'], fallback: 'brand'),
            'logo' => $request->hasFile('logo') ? $this->images->store($request->file('logo'), 'brands') : null,
        ]);
        $this->activity->log('brand.created', $brand, ['name' => $brand->name]);

        return response()->json(['data' => $this->row($brand)], 201);
    }

    /** Sent as POST because browsers can only upload files with POST. */
    public function update(Request $request, Brand $brand): JsonResponse
    {
        $data = $this->validated($request, $brand);
        $old = $brand->logo;
        $brand->update([
            'name' => $data['name'],
            'is_active' => $data['is_active'],
            'logo' => $request->hasFile('logo')
                ? $this->images->store($request->file('logo'), 'brands')
                : ($request->boolean('remove_logo') ? null : $old),
        ]);
        if ($old !== $brand->logo) {
            $this->images->delete($old);
        }
        $this->activity->log('brand.updated', $brand, ['name' => $brand->name, 'is_active' => $brand->is_active]);

        return response()->json(['data' => $this->row($brand)]);
    }

    public function destroy(Brand $brand): JsonResponse
    {
        if (Product::withTrashed()->where('brand_id', $brand->id)->exists()) {
            throw new DomainRuleException('This brand has products. Deactivate it instead.');
        }
        $this->images->delete($brand->logo);
        $brand->delete();
        $this->activity->log('brand.deleted', $brand, ['name' => $brand->name]);

        return response()->json(['message' => 'Brand deleted.']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Brand $brand = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('brands', 'name')->ignore($brand?->id)],
            'is_active' => ['required', 'boolean'],
            'logo' => ImageStore::rules(required: false, maxKb: 2048),
            'remove_logo' => ['nullable', 'boolean'],
        ], ['name.unique' => 'A brand with this name already exists.', ...ImageStore::messages('logo', 2048)]);
    }

    /** @return array<string, mixed> */
    private function row(Brand $b, int $count = 0): array
    {
        return [
            'id' => $b->id,
            'name' => $b->name,
            'slug' => $b->slug,
            'logo' => Media::url($b->logo),
            'is_active' => (bool) $b->is_active,
            'product_count' => $count,
        ];
    }
}
