<?php

namespace App\Enums;

enum CollectionType: string
{
    use HasLabel;

    case Rail = 'rail';
    case Banner = 'banner';
    case Section = 'section';

    public function label(): string
    {
        return match ($this) {
            self::Rail => 'Hanging rail',
            self::Banner => 'Banner',
            self::Section => 'Section',
        };
    }
}
