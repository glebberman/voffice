<?php

namespace Database\Seeders;

use App\Models\PropType;
use Illuminate\Database\Seeder;

class PropTypeSeeder extends Seeder
{
    /**
     * Стартовый каталог предметов живёт в resources/props.json — тот же файл
     * читают js-тесты (проверяют, что спрайты есть на диске). Дальше каталог
     * правится из браузера, поэтому сидер обновляет только известные ему типы
     * и не трогает заведённые вручную.
     */
    public function run(): void
    {
        $catalogue = json_decode(file_get_contents(resource_path('props.json')), true)['items'] ?? [];

        foreach ($catalogue as $slug => $spec) {
            PropType::updateOrCreate(['slug' => $slug], $spec);
        }
    }
}
