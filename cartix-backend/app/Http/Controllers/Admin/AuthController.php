<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Roles allowed into the admin panel. */
    public const PANEL_ROLES = ['super_admin', 'admin', 'order_manager'];

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $phone = Phone::isValid($data['phone']) ? Phone::normalize($data['phone']) : null;
        $user = $phone ? User::query()->where('phone', $phone)->first() : null;

        // Same message for an unknown phone and a wrong password, so registered numbers cannot be discovered.
        if (! $user || ! Hash::check($data['password'], $user->password) || ! $user->isActive()
            || ! $user->hasAnyRole(self::PANEL_ROLES)) {
            throw ValidationException::withMessages(['phone' => 'The phone number or password is incorrect.']);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $token = $user->createToken('admin-panel', ['admin'], now()->addDays(7));

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out']);
    }

    /** @return array<string, mixed> */
    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'phone' => $user->phone,
            'roles' => $user->getRoleNames()->values(),
            'permissions' => $user->getAllPermissions()->pluck('name')->values(),
        ];
    }
}
