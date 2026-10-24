<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Read-only list of admin actions: who did what, when and from which IP address. */
class ActivityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['nullable', 'string', 'max:100', 'regex:/^[a-z_.]+$/'],
            'user_id' => ['nullable', 'integer'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = ActivityLog::query()->with('user:id,name')->latest('id');
        if (! empty($data['action'])) {
            $query->where('action', 'like', addcslashes($data['action'], '%_\\').'%');
        }
        if (! empty($data['user_id'])) {
            $query->where('user_id', $data['user_id']);
        }
        $page = $query->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (ActivityLog $a) => [
                'id' => $a->id,
                'action' => $a->action,
                'user' => $a->user?->name,
                'subject_type' => $a->subject_type ? class_basename($a->subject_type) : null,
                'subject_id' => $a->subject_id,
                'properties' => $a->properties,
                'ip_address' => $a->ip_address,
                'at' => $a->created_at?->toIso8601String(),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'actions' => ActivityLog::query()->distinct()->orderBy('action')->pluck('action'),
        ]);
    }
}
