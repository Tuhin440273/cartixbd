<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            LocationSeeder::class,
            CartixBaseSeeder::class,
        ]);

        // Demo products and orders only on a local machine, never in production.
        if (app()->environment('local')) {
            $this->call(DemoStoreSeeder::class);
        }
    }
}
