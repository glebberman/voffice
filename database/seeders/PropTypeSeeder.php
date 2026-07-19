<?php

namespace Database\Seeders;

use App\Models\PropType;
use App\Support\JsonFile;
use Illuminate\Database\Seeder;
use RuntimeException;

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
        $catalogue = JsonFile::read(resource_path('props.json'))['items'] ?? null;
        if (! is_array($catalogue)) {
            throw new RuntimeException('props.json: нет раздела items');
        }

        foreach ($catalogue as $slug => $spec) {
            if (! is_array($spec)) {
                throw new RuntimeException("props.json: предмет {$slug} — не объект");
            }
            $fields = [];
            foreach ($spec as $field => $value) {
                $fields[(string) $field] = $value;
            }
            PropType::updateOrCreate(['slug' => (string) $slug], $fields);
        }
    }
}
