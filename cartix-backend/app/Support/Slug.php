<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

final class Slug
{
    /**
     * A URL slug that is unique in the model's table (including soft-deleted rows),
     * adding -2, -3 ... when needed.
     *
     * @param  class-string<Model>  $model
     */
    public static function unique(string $model, string $source, ?int $ignoreId = null, string $fallback = 'item'): string
    {
        $base = Str::slug($source) ?: $fallback;
        $base = Str::limit($base, 150, '');
        $slug = $base;
        for ($i = 2; self::taken($model, $slug, $ignoreId); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    /** @param  class-string<Model>  $model */
    private static function taken(string $model, string $slug, ?int $ignoreId): bool
    {
        $query = in_array(SoftDeletes::class, class_uses_recursive($model), true)
            ? $model::withTrashed()
            : $model::query();

        return $query->where('slug', $slug)->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists();
    }
}
