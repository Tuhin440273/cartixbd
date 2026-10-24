<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserStatus;
use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Admin\ActivityLogger;
use App\Support\Phone;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/** Admin panel accounts. Only super admins (permission staff.manage) can use these endpoints. */
class StaffController extends Controller
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function index(): JsonResponse
    {
        $users = User::role(AuthController::PANEL_ROLES)->with('roles')->orderBy('name')->get();

        return response()->json([
            'data' => $users->map(fn (User $u) => $this->row($u)),
            'roles' => [
                ['value' => 'super_admin', 'label' => 'Super admin', 'description' => 'Everything, including staff accounts.'],
                ['value' => 'admin', 'label' => 'Admin', 'description' => 'Orders, products, stock, coupons, reports and settings.'],
                ['value' => 'order_manager', 'label' => 'Order manager', 'description' => 'Orders and customers; can view products.'],
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'phone' => ['required', 'string', 'max:20', $this->phoneRule()],
            'email' => ['nullable', 'email:rfc', 'max:150', 'unique:users,email'],
            'role' => ['required', Rule::in(AuthController::PANEL_ROLES)],
            'password' => ['required', 'string', 'max:200', Password::min(10)->letters()->numbers()],
        ]);
        $phone = Phone::normalize($data['phone']);
        if (User::withTrashed()->where('phone', $phone)->exists()) {
            throw new DomainRuleException('An account with this phone number already exists.');
        }

        $user = DB::transaction(function () use ($data, $phone) {
            $user = User::query()->create([
                'name' => $data['name'], 'phone' => $phone, 'email' => $data['email'] ?? null, 'password' => $data['password'],
            ]);
            $user->forceFill(['status' => UserStatus::Active])->save();
            $user->syncRoles([$data['role']]);

            return $user;
        });
        $this->activity->log('staff.created', $user, ['name' => $user->name, 'role' => $data['role']]);

        return response()->json(['data' => $this->row($user->load('roles'))], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->assertStaff($user);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'role' => ['required', Rule::in(AuthController::PANEL_ROLES)],
            'status' => ['required', Rule::enum(UserStatus::class)],
        ]);
        $status = UserStatus::from($data['status']);
        $wasRole = $user->getRoleNames()->first();
        $isSelf = $request->user()->is($user);

        if ($isSelf && ($data['role'] !== $wasRole || $status !== UserStatus::Active)) {
            throw new DomainRuleException('You cannot change your own role or block yourself.');
        }
        DB::transaction(function () use ($user, $data, $status, $wasRole) {
            $losingSuper = $wasRole === 'super_admin' && ($data['role'] !== 'super_admin' || $status !== UserStatus::Active);
            if ($losingSuper && $this->activeSuperAdmins()->whereKeyNot($user->id)->doesntExist()) {
                throw new DomainRuleException('There must always be at least one active super admin.');
            }
            $user->forceFill(['name' => $data['name'], 'status' => $status])->save();
            $user->syncRoles([$data['role']]);
            // A role change or block takes effect immediately: existing sign-ins end.
            if ($data['role'] !== $wasRole || $status !== UserStatus::Active) {
                $user->tokens()->delete();
            }
        });
        $this->activity->log('staff.updated', $user, ['name' => $user->name, 'role' => [$wasRole, $data['role']], 'status' => $status->value]);

        return response()->json(['data' => $this->row($user->refresh()->load('roles'))]);
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $this->assertStaff($user);
        $data = $request->validate([
            'password' => ['required', 'string', 'max:200', Password::min(10)->letters()->numbers()],
        ]);
        $user->forceFill(['password' => $data['password']])->save();
        if (! $request->user()->is($user)) {
            $user->tokens()->delete();
        }
        $this->activity->log('staff.password_reset', $user, ['name' => $user->name]);

        return response()->json(['message' => 'Password changed.']);
    }

    private function assertStaff(User $user): void
    {
        abort_if(! $user->hasAnyRole(AuthController::PANEL_ROLES), 404, 'Staff member not found.');
    }

    private function activeSuperAdmins(): Builder
    {
        return User::role('super_admin')->where('status', UserStatus::Active->value);
    }

    private function phoneRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            if (! is_string($value) || ! Phone::isValid($value)) {
                $fail('Enter a valid Bangladeshi mobile number, for example 01712345678.');
            }
        };
    }

    /** @return array<string, mixed> */
    private function row(User $u): array
    {
        return [
            'id' => $u->id,
            'name' => $u->name,
            'phone' => $u->phone,
            'email' => $u->email,
            'role' => $u->roles->first()?->name,
            'status' => $u->status?->value ?? UserStatus::Active->value,
            'last_login_at' => $u->last_login_at?->toIso8601String(),
            'created_at' => $u->created_at?->toIso8601String(),
        ];
    }
}
