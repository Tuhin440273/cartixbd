<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Services\Admin\ActivityLogger;
use App\Services\Admin\ImageStore;
use App\Support\Media;
use App\Support\Slug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/** Two-level categories (for example Men > Hoodies). */
class CategoryController extends Controller
{
    public function __construct(private readonly ActivityLogger $activity, private readonly ImageStore $images) {}

    public function index(): JsonResponse
    {
        $counts = Product::query()->selectRaw('category_id, count(*) as total')->groupBy('category_id')->pluck('total', 'category_id');
        $all = Category::query()->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $all->whereNull('parent_id')->values()->map(fn (Category $c) => [
            ...$this->row($c, $counts),
            'children' => $all->where('parent_id', $c->id)->values()->map(fn (Category $ch) => $this->row($ch, $counts)),
        ])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $category = Category::query()->create([
            ...collect($data)->except(['image', 'remove_image'])->all(),
            'sort_order' => $data['sort_order'] ?? 0,
            'slug' => Slug::unique(Category::class, $data['name'], fallback: 'category'),
            'image' => $request->hasFile('image') ? $this->images->store($request->file('image'), 'categories') : null,
        ]);
        $this->activity->log('category.created', $category, ['name' => $category->name]);

        return response()->json(['data' => $this->row($category)], 201);
    }

    /** Sent as POST because browsers can only upload files with POST. */
    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $this->validated($request, $category);
        if (($data['parent_id'] ?? null) !== null && Category::query()->where('parent_id', $category->id)->exists()) {
            throw new DomainRuleException('This category has subcategories, so it cannot be moved under another category.');
        }

        $old = $category->image;
        $category->update([
            ...collect($data)->except(['image', 'remove_image'])->all(),
            'sort_order' => $data['sort_order'] ?? $category->sort_order,
            'image' => $request->hasFile('image')
                ? $this->images->store($request->file('image'), 'categories')
                : ($request->boolean('remove_image') ? null : $old),
        ]);
        if ($old !== $category->image) {
            $this->images->delete($old);
        }
        $this->activity->log('category.updated', $category, ['name' => $category->name, 'is_active' => $category->is_active]);

        return response()->json(['data' => $this->row($category)]);
    }

    /** Only empty categories can be deleted; others should be deactivated so product history stays intact. */
    public function destroy(Category $category): JsonResponse
    {
        if (Category::query()->where('parent_id', $category->id)->exists()) {
            throw new DomainRuleException('Delete or move the subcategories first.');
        }
        if (Product::withTrashed()->where('category_id', $category->id)->exists()) {
            throw new DomainRuleException('This category has products. Move them or deactivate the category instead.');
        }
        $this->images->delete($category->image);
        $category->delete();
        $this->activity->log('category.deleted', $category, ['name' => $category->name]);

        return response()->json(['message' => 'Category deleted.']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Category $category = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            // Only top-level categories can be parents, which keeps the tree at two levels.
            'parent_id' => ['nullable', 'integer',
                Rule::exists('categories', 'id')->whereNull('parent_id')->whereNull('deleted_at'),
                Rule::notIn(array_filter([$category?->id]))],
            'commission_rate' => ['nullable', 'decimal:0,2', 'min:0', 'max:100'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'is_active' => ['required', 'boolean'],
            'image' => ImageStore::rules(required: false, maxKb: 2048),
            'remove_image' => ['nullable', 'boolean'],
        ], [
            'parent_id.exists' => 'Choose a top-level category as the parent.',
            'parent_id.not_in' => 'A category cannot be its own parent.',
            ...ImageStore::messages('image', 2048),
        ]);
    }

    /** @return array<string, mixed> */
    private function row(Category $c, ?Collection $counts = null): array
    {
        return [
            'id' => $c->id,
            'parent_id' => $c->parent_id,
            'name' => $c->name,
            'slug' => $c->slug,
            'image' => Media::url($c->image),
            'commission_rate' => $c->commission_rate,
            'sort_order' => $c->sort_order,
            'is_active' => (bool) $c->is_active,
            'product_count' => (int) ($counts[$c->id] ?? 0),
        ];
    }
}
