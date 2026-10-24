<?php

namespace App\Enums;

enum ProductImageKind: string
{
    use HasLabel;

    case Gallery = 'gallery';
    case RailSide = 'rail_side';
    case RailFront = 'rail_front';
    case RailBack = 'rail_back';

    public function label(): string
    {
        return match ($this) {
            self::Gallery => 'Gallery',
            self::RailSide => 'Rail: side view',
            self::RailFront => 'Rail: front view',
            self::RailBack => 'Rail: back view',
        };
    }
}
