<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Records who changed what in the admin panel, with the request IP address. */
final class ActivityLogger
{
    public function __construct(private readonly Request $request) {}

    /** @param  array<string, mixed>  $properties  short, non-secret details (never passwords or tokens) */
    public function log(string $action, ?Model $subject = null, array $properties = []): void
    {
        ActivityLog::query()->create([
            'user_id' => $this->request->user()?->id,
            'action' => $action,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'properties' => $properties === [] ? null : $properties,
            'ip_address' => $this->request->ip(),
        ]);
    }
}
