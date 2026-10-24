<?php

namespace App\Services\Admin;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Stores uploaded images on the public disk under a fixed folder with a random file name.
 * Only JPEG, PNG and WebP are accepted by the validation rule below; SVG is refused because it can carry scripts.
 */
final class ImageStore
{
    /** Folders that admin uploads go into. Files elsewhere (for example demo artwork) are never deleted. */
    public const FOLDERS = ['products', 'categories', 'brands', 'banners'];

    /** @return list<string> */
    public static function rules(bool $required = true, int $maxKb = 4096): array
    {
        return [
            $required ? 'required' : 'nullable',
            'file',
            'image',
            'mimes:jpg,jpeg,png,webp',
            'mimetypes:image/jpeg,image/png,image/webp',
            'max:'.$maxKb,
            'dimensions:min_width=100,min_height=100,max_width=5000,max_height=5000',
        ];
    }

    /** @return array<string, string> English messages for the rules above. */
    public static function messages(string $field = 'image', int $maxKb = 4096): array
    {
        $mb = intdiv($maxKb, 1024);

        return [
            "{$field}.required" => 'Choose an image to upload.',
            "{$field}.file" => 'Upload a JPG, PNG or WebP image.',
            "{$field}.image" => 'Upload a JPG, PNG or WebP image.',
            "{$field}.mimes" => 'Upload a JPG, PNG or WebP image.',
            "{$field}.mimetypes" => 'Upload a JPG, PNG or WebP image.',
            "{$field}.max" => "The image must be {$mb} MB or smaller.",
            "{$field}.dimensions" => 'The image must be between 100 and 5000 pixels wide and high.',
        ];
    }

    public function store(UploadedFile $file, string $folder): string
    {
        if (! in_array(explode('/', $folder)[0], self::FOLDERS, true)) {
            throw new \InvalidArgumentException("Unknown upload folder: {$folder}");
        }

        return $file->store($folder, 'public');
    }

    /** Deletes a file only when it was uploaded through the admin panel. */
    public function delete(?string $path): void
    {
        if ($path === null || $path === '' || str_contains($path, '..')) {
            return;
        }
        if (in_array(explode('/', $path)[0], self::FOLDERS, true)) {
            Storage::disk('public')->delete($path);
        }
    }
}
