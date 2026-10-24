<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleSeeder extends Seeder
{
    /** @var array<string, list<string>> role => permissions */
    public const ROLES = [
        // super_admin gets every permission, including staff.manage, which no other role has.
        'super_admin' => ['*'],
        'admin' => [
            'dashboard.view', 'orders.view', 'orders.manage', 'products.view', 'products.manage',
            'inventory.manage', 'customers.view', 'vendors.manage', 'coupons.manage', 'settings.manage',
            'reports.view', 'reviews.manage', 'activity.view',
        ],
        'order_manager' => ['dashboard.view', 'orders.view', 'orders.manage', 'products.view', 'customers.view'],
        'vendor_owner' => [],
        'vendor_staff' => [],
        'customer' => [],
    ];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $all = collect(self::ROLES)->flatten()->push('staff.manage')->reject(fn ($p) => $p === '*')->unique();
        foreach ($all as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        foreach (self::ROLES as $role => $permissions) {
            $r = Role::findOrCreate($role, 'web');
            $r->syncPermissions($permissions === ['*'] ? $all->all() : $permissions);
        }
    }
}
