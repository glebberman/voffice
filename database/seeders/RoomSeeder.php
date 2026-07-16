<?php

namespace Database\Seeders;

use App\Models\Room;
use Illuminate\Database\Seeder;

class RoomSeeder extends Seeder
{
    /**
     * Карты комнат живут в resources/maps/*.json — единый источник правды
     * для сидера и js-тестов целостности.
     */
    public function run(): void
    {
        $rooms = [
            ['slug' => 'office', 'name' => 'Офис'],
            ['slug' => 'coworking', 'name' => 'Коворкинг'],
        ];

        foreach ($rooms as $room) {
            Room::updateOrCreate(
                ['slug' => $room['slug']],
                [
                    'name' => $room['name'],
                    'map' => json_decode(file_get_contents(resource_path("maps/{$room['slug']}.json")), true),
                ],
            );
        }
    }
}
