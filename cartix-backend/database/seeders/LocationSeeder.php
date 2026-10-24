<?php

namespace Database\Seeders;

use App\Enums\ShippingZone;
use App\Models\District;
use App\Models\Division;
use App\Models\ShippingRate;
use Illuminate\Database\Seeder;

/**
 * The 8 divisions and 64 districts of Bangladesh, each with its delivery zone.
 * Upazilas are not seeded: load the full official list with a separate seeder before relying on them.
 */
class LocationSeeder extends Seeder
{
    private const SUB_DHAKA = ['Gazipur', 'Narayanganj', 'Munshiganj', 'Manikganj', 'Narsingdi'];

    /** @var array<string, list<string>> */
    private const DATA = [
        'Dhaka' => ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj',
            'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
        'Chattogram' => ['Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', "Cox's Bazar", 'Feni',
            'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati'],
        'Rajshahi' => ['Bogura', 'Chapainawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi', 'Sirajganj'],
        'Khulna' => ['Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira'],
        'Barishal' => ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
        'Sylhet' => ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
        'Rangpur' => ['Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon'],
        'Mymensingh' => ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
    ];

    public function run(): void
    {
        foreach (self::DATA as $division => $districts) {
            $div = Division::query()->updateOrCreate(['name' => $division], []);
            foreach ($districts as $name) {
                District::query()->updateOrCreate(['name' => $name], [
                    'division_id' => $div->id,
                    'shipping_zone' => match (true) {
                        $name === 'Dhaka' => ShippingZone::InsideDhaka,
                        in_array($name, self::SUB_DHAKA, true) => ShippingZone::SubDhaka,
                        default => ShippingZone::OutsideDhaka,
                    },
                ]);
            }
        }

        // Sample rates only: replace them with your courier's actual rates.
        $rates = [
            [ShippingZone::InsideDhaka, '70.00', 1, 2],
            [ShippingZone::SubDhaka, '100.00', 2, 3],
            [ShippingZone::OutsideDhaka, '130.00', 2, 5],
        ];
        foreach ($rates as [$zone, $fee, $min, $max]) {
            ShippingRate::query()->updateOrCreate(['zone' => $zone], [
                'base_fee' => $fee, 'per_kg_fee' => '20.00', 'min_days' => $min, 'max_days' => $max, 'is_active' => true,
            ]);
        }
    }
}
