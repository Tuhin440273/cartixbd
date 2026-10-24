<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Admin\AuthController;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Checked on every admin request, not only at login: a staff member who is blocked or loses their
 * admin role is signed out at once, even if their token has not expired yet.
 */
class EnsureActiveStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        if (! $user->isActive()) {
            // A blocked account is signed out on its next request.
            $token = $user->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                $token->delete();
            }

            return response()->json(['message' => 'Your admin access has ended. Please sign in again.'], 401);
        }
        if (! $user->hasAnyRole(AuthController::PANEL_ROLES)) {
            return response()->json(['message' => 'You do not have access to the admin panel.'], 403);
        }

        return $next($request);
    }
}
