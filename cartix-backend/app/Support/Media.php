<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;

final class Media
{
    /** Public URL for a stored file path; absolute URLs pass through unchanged. */
    public static function url(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return Storage::disk('public')->url($path);
    }
}
