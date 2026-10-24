<?php

namespace Database\Seeders\Support;

/**
 * Demo-only artwork: flat SVG illustrations of garments on a hanger.
 * Used by DemoStoreSeeder so the local storefront has real image files to display.
 * Replace with real product photos in production.
 */
final class GarmentSvg
{
    public const KINDS = ['hoodie', 'jacket', 'tshirt', 'shirt', 'panjabi', 'burqa', 'threepiece', 'kurti'];

    /** Transparent 160x320 garment, used for the hanging rail. $view: front | back | side */
    public static function rail(string $kind, string $color, ?string $accent, string $view = 'front'): string
    {
        $art = self::art($kind, $color, $accent, $view === 'back' ? 'back' : 'front');
        if ($view === 'side') {
            // A side view is the front view narrowed around the hanger hook and slightly darkened.
            $art = '<g transform="translate(46.4 0) scale(0.42 1)" filter="url(#dim)">'.$art.'</g>';
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 320" width="320" height="640">'
            .'<defs><filter id="dim"><feComponentTransfer><feFuncR type="linear" slope="0.88"/><feFuncG type="linear" slope="0.88"/><feFuncB type="linear" slope="0.88"/></feComponentTransfer></filter></defs>'
            .$art.'</svg>';
    }

    /** 800x1000 product photo stand-in: the garment centred on a soft studio background. */
    public static function gallery(string $kind, string $color, ?string $accent, string $view = 'front'): string
    {
        $bg = self::shade($color, 0.86);
        $floor = self::shade($color, 0.78);

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="800" height="1000">'
            .'<rect width="400" height="500" fill="'.$bg.'"/>'
            .'<ellipse cx="200" cy="462" rx="120" ry="12" fill="'.$floor.'"/>'
            .'<g transform="translate(110 40) scale(1.125)">'.self::art($kind, $color, $accent, $view).'</g>'
            .'</svg>';
    }

    public static function shade(string $hex, float $amount): string
    {
        $hex = ltrim($hex, '#');
        $target = $amount < 0 ? 0 : 255;
        $p = min(abs($amount), 1);
        $out = '#';
        foreach ([0, 2, 4] as $i) {
            $v = hexdec(substr($hex, $i, 2));
            $out .= str_pad(dechex((int) round(($target - $v) * $p + $v)), 2, '0', STR_PAD_LEFT);
        }

        return $out;
    }

    private static function art(string $kind, string $color, ?string $accent, string $view): string
    {
        $dark = self::shade($color, -0.2);
        $darker = self::shade($color, -0.36);
        $acc = $accent ?? self::shade($color, 0.45);
        $front = $view === 'front';
        $o = ' stroke="'.$darker.'" stroke-width="1" stroke-linejoin="round"';
        $p = fn (string $d, string $fill, bool $outline = true) => '<path d="'.$d.'" fill="'.$fill.'"'.($outline ? $o : '').'/>';
        $line = fn (string $d, string $stroke, float $w = 1.5, string $extra = '') => '<path d="'.$d.'" fill="none" stroke="'.$stroke.'" stroke-width="'.$w.'"'.$extra.'/>';
        $rect = fn ($x, $y, $w, $h, $fill, $rx = 3) => '<rect x="'.$x.'" y="'.$y.'" width="'.$w.'" height="'.$h.'" rx="'.$rx.'" fill="'.$fill.'"/>';
        $circle = fn ($cx, $cy, $r, $fill) => '<circle cx="'.$cx.'" cy="'.$cy.'" r="'.$r.'" fill="'.$fill.'"/>';

        $hanger = '<path d="M80 32 V20 Q80 6 90 6 Q99 6 99 14" fill="none" stroke="#8B9099" stroke-width="3" stroke-linecap="round"/>'
            .'<path d="M80 32 L34 52 M80 32 L126 52" stroke="#7A5A3F" stroke-width="4" stroke-linecap="round"/>';

        $g = match ($kind) {
            'hoodie' => $p('M44 52 Q30 60 28 82 L22 188 L38 190 L44 98 Z', $dark).$p('M116 52 Q130 60 132 82 L138 188 L122 190 L116 98 Z', $dark)
                .$p('M46 50 L114 50 L120 64 L122 206 Q80 212 38 206 L40 64 Z', $color)
                .$rect(38, 196, 84, 11, $dark).$rect(21, 180, 18, 10, $darker).$rect(121, 180, 18, 10, $darker)
                .$p('M54 50 Q56 28 80 26 Q104 28 106 50 Q94 64 80 64 Q66 64 54 50 Z', $dark)
                .($front
                    ? $line('M62 50 Q80 66 98 50', $darker, 2).$line('M72 60 L70 100 M88 60 L90 100', self::shade($color, 0.55), 2, ' stroke-linecap="round"')
                        .$p('M54 148 L106 148 L112 182 L48 182 Z', $dark).($accent ? $rect(56, 104, 48, 22, $acc) : '')
                    : $line('M80 64 V200', $dark, 1)),
            'jacket' => $p('M46 52 Q32 60 30 80 L24 182 L40 184 L46 96 Z', $dark).$p('M114 52 Q128 60 130 80 L136 182 L120 184 L114 96 Z', $dark)
                .$p('M48 48 L112 48 L118 62 L120 192 Q80 198 40 192 L42 62 Z', $color).$rect(40, 184, 80, 9, $dark)
                .($front
                    ? $p('M62 44 L80 62 L98 44 L102 56 L80 74 L58 56 Z', $dark).$line('M80 62 V192', self::shade($color, 0.5), 2)
                        .$rect(50, 130, 22, 26, $dark).$rect(88, 130, 22, 26, $dark)
                    : $p('M62 44 Q80 54 98 44 L98 52 Q80 62 62 52 Z', $dark, false)),
            'tshirt' => $p('M48 48 L40 62 L26 94 L42 100 L50 76 Z', $dark).$p('M112 48 L120 62 L134 94 L118 100 L110 76 Z', $dark)
                .$p('M50 46 L110 46 L118 62 L118 180 Q80 186 42 180 L42 62 Z', $color)
                .($front
                    ? $line('M64 46 Q80 62 96 46', $darker, 3).($accent ? $rect(58, 90, 44, 12, $acc, 2).'<rect x="64" y="106" width="32" height="6" rx="2" fill="'.$acc.'" opacity="0.7"/>' : '')
                    : $line('M66 46 Q80 52 94 46', $darker, 3)),
            'shirt' => $p('M48 50 Q34 58 32 78 L26 186 L40 188 L48 96 Z', $dark).$p('M112 50 Q126 58 128 78 L134 186 L120 188 L112 96 Z', $dark)
                .$rect(25, 178, 16, 10, $darker, 2).$rect(119, 178, 16, 10, $darker, 2)
                .$p('M50 46 L110 46 L116 60 L118 196 Q100 204 80 198 Q60 204 42 196 L44 60 Z', $color)
                .($front
                    ? $p('M64 44 L80 62 L96 44 L94 36 L80 48 L66 36 Z', self::shade($color, 0.3)).$line('M80 62 V196', $dark)
                        .implode('', array_map(fn ($y) => $circle(83, $y, 2, self::shade($color, 0.6)), [78, 104, 130, 156, 182]))
                        .$line('M90 84 H106 V102 H90 Z', $dark)
                    : $line('M48 70 H112', $dark)),
            'panjabi' => $p('M50 50 Q38 58 36 78 L32 196 L46 198 L52 96 Z', $dark).$p('M110 50 Q122 58 124 78 L128 196 L114 198 L108 96 Z', $dark)
                .$p('M52 46 L108 46 L114 60 L118 262 L42 262 L46 60 Z', $color).$line('M42 222 L46 262 M118 222 L114 262', $dark)
                .($front
                    ? $rect(70, 40, 20, 9, $acc, 2).'<path d="M76 49 H84 V118 H76 Z" fill="'.$acc.'" opacity="0.85"/>'
                        .implode('', array_map(fn ($y) => $circle(80, $y, 2.2, self::shade($acc, -0.4)), [62, 82, 102]))
                        .$line('M44 250 H116', $acc, 3)
                    : $rect(70, 40, 20, 7, $acc, 2)),
            'burqa' => $p('M44 54 Q20 70 14 122 L14 200 L40 196 L46 100 Z', $dark).$p('M116 54 Q140 70 146 122 L146 200 L120 196 L114 100 Z', $dark)
                .$p('M52 46 L108 46 Q118 54 122 76 L142 298 Q80 306 18 298 L38 76 Q42 54 52 46 Z', $color)
                .$line('M14 190 L40 186 M146 190 L120 186', $acc, 3)
                .($front
                    ? $line('M64 46 Q80 58 96 46', $acc, 2.5).$line('M80 56 V300', $acc, 2)
                        .$line('M74 70 Q80 78 86 70 M74 90 Q80 98 86 90 M74 110 Q80 118 86 110', $acc, 1.6)
                        .$line('M22 288 Q80 296 138 288', $acc, 2)
                    : $line('M80 60 V300', $dark, 1)),
            'threepiece' => $p('M50 50 L42 64 L30 146 L46 150 L54 82 Z', $dark).$p('M110 50 L118 64 L130 146 L114 150 L106 82 Z', $dark)
                .$line('M30 140 L46 144 M130 140 L114 144', $acc, 3)
                .$p('M52 46 L108 46 L116 62 L128 252 Q80 258 32 252 L44 62 Z', $color)
                .'<path d="M33 240 Q80 247 127 240 L128 252 Q80 258 32 252 Z" fill="'.$acc.'"/>'
                .($front
                    ? $line('M64 46 Q80 72 96 46', $acc, 3).implode('', array_map(fn ($y) => '<circle cx="80" cy="'.$y.'" r="3" fill="'.$acc.'" opacity="0.85"/>', [96, 120, 144]))
                    : '')
                .'<path d="M36 46 Q66 38 94 46 L66 292 L40 288 Z" fill="'.self::shade($acc, 0.25).'" opacity="0.88"'.$o.'/>'
                .$line('M40 280 L66 284', self::shade($acc, -0.3), 2, ' stroke-dasharray="3 3"'),
            'kurti' => $p('M50 50 L42 64 L32 150 L48 154 L54 82 Z', $dark).$p('M110 50 L118 64 L128 150 L112 154 L106 82 Z', $dark)
                .$p('M52 46 L108 46 L116 62 L124 226 Q80 232 36 226 L44 62 Z', $color).$line('M38 196 L40 226 M122 196 L120 226', $dark)
                .($front
                    ? '<path d="M58 46 Q80 92 102 46 L98 46 Q80 80 62 46 Z" fill="'.$acc.'"/>'.$line('M40 214 Q80 220 120 214', $acc, 2.5)
                    : $line('M64 46 Q80 58 96 46', $acc, 2)),
            default => throw new \InvalidArgumentException("Unknown garment kind: {$kind}"),
        };

        return $hanger.$g;
    }
}
