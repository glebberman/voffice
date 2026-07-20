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
            if (! is_array($spec) || ! is_string($spec['label'] ?? null) || ! is_array($spec['orientations'] ?? null)) {
                throw new RuntimeException("props.json: у предмета {$slug} нет label или orientations");
            }

            $default = $spec['defaultState'] ?? null;
            $type = PropType::updateOrCreate(['slug' => (string) $slug], [
                'label' => $spec['label'],
                'default_state' => is_string($default) ? $default : null,
            ]);

            foreach ($spec['orientations'] as $dir => $orientation) {
                if (! is_array($orientation)) {
                    throw new RuntimeException("props.json: ориентация {$slug}.{$dir} — не объект");
                }
                $fields = [];
                foreach ($orientation as $field => $value) {
                    $fields[(string) $field] = $value;
                }
                $type->orientations()->updateOrCreate(['dir' => (string) $dir], $fields);
            }
        }
    }
}
