<?php

namespace Database\Seeders;

use App\Models\PropCategory;
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
        $data = JsonFile::read(resource_path('props.json'));
        $catalogue = $data['items'] ?? null;
        if (! is_array($catalogue)) {
            throw new RuntimeException('props.json: нет раздела items');
        }

        $categoryIds = $this->seedCategories($data['categories'] ?? []);

        foreach ($catalogue as $slug => $spec) {
            if (! is_array($spec) || ! is_string($spec['label'] ?? null) || ! is_array($spec['orientations'] ?? null)) {
                throw new RuntimeException("props.json: у предмета {$slug} нет label или orientations");
            }

            $default = $spec['defaultState'] ?? null;
            $description = $spec['description'] ?? '';
            $type = PropType::updateOrCreate(['slug' => (string) $slug], [
                'label' => $spec['label'],
                'description' => is_string($description) ? $description : '',
                'default_state' => is_string($default) ? $default : null,
            ]);

            $type->categories()->sync($this->categoryIdsOf($spec, $categoryIds));

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

    /**
     * Категории двух осей; предметы ссылаются на них слогами, поэтому сидер
     * возвращает словарь ось → слог → id.
     *
     * @return array<string, array<string, int>>
     */
    private function seedCategories(mixed $categories): array
    {
        $ids = [];
        foreach (is_array($categories) ? $categories : [] as $axis => $entries) {
            if (! is_array($entries)) {
                continue;
            }
            foreach ($entries as $slug => $fields) {
                $label = is_array($fields) ? ($fields['label'] ?? null) : null;
                $sort = is_array($fields) ? ($fields['sort'] ?? 0) : 0;
                if (! is_string($label)) {
                    throw new RuntimeException("props.json: у категории {$axis}/{$slug} нет label");
                }
                $category = PropCategory::updateOrCreate(
                    ['axis' => (string) $axis, 'slug' => (string) $slug],
                    ['label' => $label, 'sort' => is_int($sort) ? $sort : 0],
                );
                $ids[(string) $axis][(string) $slug] = $category->id;
            }
        }

        return $ids;
    }

    /**
     * @param  array<mixed>  $spec
     * @param  array<string, array<string, int>>  $categoryIds
     * @return list<int>
     */
    private function categoryIdsOf(array $spec, array $categoryIds): array
    {
        $ids = [];
        foreach ([['purpose', 'purposes'], ['room', 'roomKinds']] as [$axis, $key]) {
            foreach (is_array($spec[$key] ?? null) ? $spec[$key] : [] as $slug) {
                $id = $categoryIds[$axis][is_string($slug) ? $slug : ''] ?? null;
                if ($id !== null) {
                    $ids[] = $id;
                }
            }
        }

        return $ids;
    }
}
