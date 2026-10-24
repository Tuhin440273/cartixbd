<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\SalesReport;
use App\Support\ShopTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReportController extends Controller
{
    public function __construct(private readonly SalesReport $report) {}

    /** Sales and profit between two Dhaka calendar dates (inclusive). Default: the last 30 days. */
    public function sales(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ], ['to.after_or_equal' => 'The end date must be on or after the start date.']);

        $today = Carbon::now(ShopTime::TZ);
        $from = Carbon::parse($data['from'] ?? $today->copy()->subDays(29)->toDateString(), ShopTime::TZ)->startOfDay();
        $to = Carbon::parse($data['to'] ?? $today->toDateString(), ShopTime::TZ)->endOfDay();
        if ($from->diffInDays($to) > 366) {
            return response()->json(['message' => 'Choose a period of one year or less.', 'errors' => ['from' => ['Choose a period of one year or less.']]], 422);
        }

        $fromUtc = $from->copy()->utc();
        $toUtc = $to->copy()->utc();

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'summary' => $this->report->summary($fromUtc, $toUtc),
            'daily' => $this->report->daily($fromUtc, $toUtc),
            'top_products' => $this->report->topProducts($fromUtc, $toUtc),
        ]);
    }
}
