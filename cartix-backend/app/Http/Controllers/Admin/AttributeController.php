<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Services\Admin\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Size and color values used to build product variants. */
class AttributeController extends Controller
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function index(): JsonResponse
    {
        $usage = DB::table('variant_attribute_values')->selectRaw('attribute_value_id, count(*) as total')
            ->groupBy('attribute_value_id')->pluck('total', 'attribute_value_id');

        return response()->json(['data' => Attribute::query()->with(['values' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')])
            ->orderBy('id')->get()->map(fn (Attribute $a) => [
                'id' => $a->id,
                'code' => $a->code,
                'name' => $a->name,
                'type' => $a->type,
                'values' => $a->values->map(fn (AttributeValue $v) => $this->row($v, (int) ($usage[$v->id] ?? 0))),
            ])]);
    }

    public function store(Request $request, Attribute $attribute): JsonResponse
    {
        $data = $this->validated($request, $attribute);
        $value = $attribute->values()->create([
            'value' => $data['value'],
            'color_hex' => $attribute->code === 'color' ? $data['color_hex'] ?? null : null,
            'sort_order' => $data['sort_order'] ?? ((int) $attribute->values()->max('sort_order') + 1),
        ]);
        $this->activity->log('attribute_value.created', $value, ['attribute' => $attribute->code, 'value' => $value->value]);

        return response()->json(['data' => $this->row($value)], 201);
    }

    /** Renaming a value changes how existing variants are labelled; past orders keep their own snapshot. */
    public function update(Request $request, AttributeValue $value): JsonResponse
    {
        $attribute = $value->attribute()->firstOrFail();
        $data = $this->validated($request, $attribute, $value);
        $value->update([
            'value' => $data['value'],
            'color_hex' => $attribute->code === 'color' ? $data['color_hex'] ?? null : null,
            'sort_order' => $data['sort_order'] ?? $value->sort_order,
        ]);
        $this->activity->log('attribute_value.updated', $value, ['attribute' => $attribute->code, 'value' => $value->value]);

        return response()->json(['data' => $this->row($value)]);
    }

    public function destroy(AttributeValue $value): JsonResponse
    {
        if (DB::table('variant_attribute_values')->where('attribute_value_id', $value->id)->exists()) {
            throw new DomainRuleException('This value is used by product variants, so it cannot be deleted.');
        }
        $value->delete();
        $this->activity->log('attribute_value.deleted', null, ['value' => $value->value]);

        return response()->json(['message' => 'Value deleted.']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, Attribute $attribute, ?AttributeValue $value = null): array
    {
        return $request->validate([
            'value' => ['required', 'string', 'max:100',
                Rule::unique('attribute_values', 'value')->where('attribute_id', $attribute->id)->ignore($value?->id)],
            'color_hex' => [$attribute->code === 'color' ? 'required' : 'nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:10000'],
        ], [
            'value.unique' => 'This value already exists.',
            'color_hex.regex' => 'Use a color code like #1E2228.',
            'color_hex.required' => 'Choose a color.',
        ]);
    }

    /** @return array<string, mixed> */
    private function row(AttributeValue $v, int $usage = 0): array
    {
        return ['id' => $v->id, 'value' => $v->value, 'color_hex' => $v->color_hex, 'sort_order' => $v->sort_order, 'variant_count' => $usage];
    }
}
