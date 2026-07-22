<?php

namespace App\Http\Requests;

use App\Models\PropOrientation;
use App\Models\PropType;
use App\Support\PropBehaviors;
use App\Support\SpriteSheets;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PropTypeRequest extends FormRequest
{
    private const TILE = 32;

    private const NAME_REGEX = '/^[a-z0-9-]+$/';

    public function authorize(): bool
    {
        return (bool) $this->user()?->is_admin;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $type = $this->route('prop_type');

        return [
            // slug — ключ, которым предмет назван в картах; у типа, который
            // уже стоит на картах, менять его нельзя (проверка в after())
            'slug' => [
                'required', 'string', 'max:64', 'regex:'.self::NAME_REGEX,
                Rule::unique('prop_types', 'slug')->ignore($type),
            ],
            'label' => ['required', 'string', 'max:80'],
            'description' => ['present', 'nullable', 'string', 'max:500'], // карточка каталога
            'categoryIds' => ['sometimes', 'array', 'max:32'],
            'categoryIds.*' => ['integer', Rule::exists('prop_categories', 'id')],
            // что рисуется, пока предметом не пользуются; null = состояний нет
            'defaultState' => ['present', 'nullable', 'string', 'max:64', 'regex:'.self::NAME_REGEX],
            // поведение: как взаимодействуют с предметом; null = обычная мебель.
            // present, а не sometimes: typeFields() пишет поле всегда, и запрос
            // без ключа молча обнулял бы поведение существующего типа
            'behavior' => ['present', 'nullable', 'string', Rule::in(PropBehaviors::ALL)],
            // ориентации приходят полным набором: чего нет в запросе, того у
            // типа больше нет
            'orientations' => ['required', 'array', 'min:1', 'max:'.count(PropOrientation::DIRS)],
            'orientations.*.dir' => ['required', 'string', Rule::in(PropOrientation::DIRS), 'distinct'],
            'orientations.*.sheet' => ['required', 'string', Rule::in(SpriteSheets::all())],
            'orientations.*.sx' => ['required', 'integer', 'min:0', 'multiple_of:'.self::TILE],
            'orientations.*.sy' => ['required', 'integer', 'min:0', 'multiple_of:'.self::TILE],
            'orientations.*.w' => ['required', 'integer', 'min:1', 'max:16'],
            'orientations.*.h' => ['required', 'integer', 'min:1', 'max:16'],
            'orientations.*.tall' => ['required', 'integer', 'min:0', 'max:8'],
            // состояния: у региона свой лист и угол, размер — от ориентации.
            // distinct здесь не годится: он сравнил бы имена «сквозь» стороны,
            // а одинаковые имена в разных сторонах как раз обязательны
            'orientations.*.states' => ['sometimes', 'array', 'max:16'],
            'orientations.*.states.*.name' => ['required', 'string', 'max:64', 'regex:'.self::NAME_REGEX],
            'orientations.*.states.*.sheet' => ['required', 'string', Rule::in(SpriteSheets::all())],
            'orientations.*.states.*.sx' => ['required', 'integer', 'min:0', 'multiple_of:'.self::TILE],
            'orientations.*.states.*.sy' => ['required', 'integer', 'min:0', 'multiple_of:'.self::TILE],
            // зона взаимодействия: смещения клеток от origin, отрицательные
            // допустимы; дубли и наложение на основание ловит after()
            'orientations.*.interaction' => ['sometimes', 'array', 'max:32'],
            'orientations.*.interaction.*.dx' => ['required', 'integer', 'between:-8,8'],
            'orientations.*.interaction.*.dy' => ['required', 'integer', 'between:-8,8'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'Ключ — латиница в нижнем регистре, цифры и дефис',
            'slug.unique' => 'Такой ключ уже есть в каталоге',
            'orientations.*.dir.distinct' => 'Сторона повторяется',
            'orientations.*.states.*.name.regex' => 'Имя состояния — латиница в нижнем регистре, цифры и дефис',
        ];
    }

    /**
     * @return list<callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $this->assertSlugStaysWhileUsed($validator);

                $names = null;
                $behavior = $this->validatedBehavior();

                foreach ($this->orientationFields() as $i => $orientation) {
                    // базовый регион не должен вылезать за пределы своего листа
                    $this->assertRegionFits(
                        $validator, "orientations.{$i}.sheet",
                        $orientation['sheet'], $orientation['sx'], $orientation['sy'], $orientation['w'], $orientation['h'] + $orientation['tall'],
                    );

                    // регион состояния — того же размера, но на своём листе
                    foreach (array_values($orientation['states']) as $j => $state) {
                        $this->assertRegionFits(
                            $validator, "orientations.{$i}.states.{$j}.sheet",
                            $state['sheet'], $state['sx'], $state['sy'], $orientation['w'], $orientation['h'] + $orientation['tall'],
                        );
                    }

                    // имена состояний общие для всех сторон: повёрнутый телевизор
                    // обязан уметь те же «вкл/выкл», что и прямой
                    $ownNames = array_keys($orientation['states']);
                    if ($names === null) {
                        $names = $ownNames;
                    } elseif ($names !== $ownNames) {
                        $validator->errors()->add("orientations.{$i}.states", 'У всех сторон должен быть один и тот же набор состояний');
                    }

                    // клетки зоны — без дублей и не поверх основания (на нём не стоят)
                    $this->assertInteraction($validator, $i, $orientation['w'], $orientation['h']);

                    // с предметом взаимодействуют, стоя в зоне: поведение без зоны
                    // недостижимо, поэтому у интерактивного типа зона обязательна
                    if ($behavior !== null && $orientation['interaction'] === []) {
                        $validator->errors()->add("orientations.{$i}.interaction", 'У предмета с поведением должна быть зона взаимодействия');
                    }
                }

                $default = $this->validatedDefaultState();
                if ($names !== null && $names !== [] && $default === null) {
                    $validator->errors()->add('defaultState', 'У предмета с состояниями должно быть состояние по умолчанию');
                }
                if ($default !== null && ! in_array($default, $names ?? [], true)) {
                    $validator->errors()->add('defaultState', 'Такого состояния нет у предмета');
                }
            },
        ];
    }

    /**
     * Клетки зоны взаимодействия ориентации $i: без дублей и не поверх
     * основания. dx/dy читаем из сырого запроса, чтобы указать номер клетки.
     */
    private function assertInteraction(Validator $validator, int $i, int $w, int $h): void
    {
        $raw = $this->input("orientations.{$i}.interaction");
        if (! is_array($raw)) {
            return;
        }
        $seen = [];
        foreach (array_values($raw) as $j => $cell) {
            if (! is_array($cell)) {
                continue;
            }
            $dx = $cell['dx'] ?? null;
            $dy = $cell['dy'] ?? null;
            if (! is_int($dx) || ! is_int($dy)) {
                continue; // о неверном типе уже сообщили правила
            }
            $key = "{$dx},{$dy}";
            if (isset($seen[$key])) {
                $validator->errors()->add("orientations.{$i}.interaction.{$j}", 'Клетка зоны повторяется');

                continue;
            }
            $seen[$key] = true;
            if ($dx >= 0 && $dx < $w && $dy >= 0 && $dy < $h) {
                $validator->errors()->add("orientations.{$i}.interaction.{$j}", 'Клетка зоны не может стоять на основании предмета');
            }
        }
    }

    /**
     * Тип, который уже стоит на картах, переименовать нельзя: карты ссылаются
     * на него строкой, внешнего ключа нет — предметы осиротели бы (перестали
     * рисоваться и блокировать проход), а сохранение таких комнат падало бы на
     * `Rule::in(каталог)`. UI дизейблит поле по снапшоту usage, но устаревшая
     * вкладка и прямой PUT его обходят, поэтому решает сервер.
     */
    private function assertSlugStaysWhileUsed(Validator $validator): void
    {
        $type = $this->route('prop_type');
        if (! $type instanceof PropType) {
            return; // создание: ключ ещё ничей
        }

        $slug = $this->string('slug')->toString();
        if ($slug === $type->slug) {
            return;
        }

        $used = PropType::usage()[$type->slug] ?? 0;
        if ($used > 0) {
            $validator->errors()->add('slug', "Предмет стоит на картах ({$used} шт.) — ключ менять нельзя");
        }
    }

    private function assertRegionFits(Validator $validator, string $key, string $sheet, int $sx, int $sy, int $w, int $rows): void
    {
        $size = SpriteSheets::size($sheet);
        if (! $size) {
            return;
        }
        if ($sx + $w * self::TILE > $size['width'] || $sy + $rows * self::TILE > $size['height']) {
            $validator->errors()->add($key, "Регион вылезает за лист ({$size['width']}×{$size['height']} px)");
        }
    }

    /**
     * Ориентации из запроса в известной форме. Элементы, не прошедшие правила
     * из rules(), молча пропускаются — о них уже сообщила валидация.
     * Регионы состояний собираются в словарь по имени и сортируются: в этом
     * виде они уезжают в БД, каталог и экспорт.
     *
     * @return list<array{dir: string, sheet: string, sx: int, sy: int, w: int, h: int, tall: int, states: array<string, array{sheet: string, sx: int, sy: int}>, interaction: list<array{dx: int, dy: int}>}>
     */
    public function orientationFields(): array
    {
        $raw = $this->input('orientations');
        if (! is_array($raw)) {
            return [];
        }

        $out = [];
        foreach (array_values($raw) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $dir = $item['dir'] ?? null;
            $sheet = $item['sheet'] ?? null;
            $sx = $item['sx'] ?? null;
            $sy = $item['sy'] ?? null;
            $w = $item['w'] ?? null;
            $h = $item['h'] ?? null;
            $tall = $item['tall'] ?? null;
            if (! is_string($dir) || ! is_string($sheet)) {
                continue;
            }
            if (! is_int($sx) || ! is_int($sy) || ! is_int($w) || ! is_int($h) || ! is_int($tall)) {
                continue;
            }
            $out[] = [
                'dir' => $dir, 'sheet' => $sheet, 'sx' => $sx, 'sy' => $sy, 'w' => $w, 'h' => $h, 'tall' => $tall,
                'states' => self::stateFields($item['states'] ?? []),
                'interaction' => self::interactionFields($item['interaction'] ?? [], $w, $h),
            ];
        }

        return $out;
    }

    /**
     * Клетки зоны в известной форме: {dx,dy} целые, без дублей, не на основании
     * (0<=dx<w, 0<=dy<h), по (dy,dx). В этом виде уезжают в БД, каталог и
     * экспорт. Отсев на основании дублирует проверку assertInteraction: тот
     * даёт пользователю ошибку, а этот страхует запись на случай, если сверка
     * по индексу разъедется (число пришло строкой — ориентация выпала).
     *
     * @return list<array{dx: int, dy: int}>
     */
    private static function interactionFields(mixed $raw, int $w, int $h): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $seen = [];
        $cells = [];
        foreach ($raw as $cell) {
            if (! is_array($cell)) {
                continue;
            }
            $dx = $cell['dx'] ?? null;
            $dy = $cell['dy'] ?? null;
            if (! is_int($dx) || ! is_int($dy) || isset($seen["{$dx},{$dy}"])) {
                continue;
            }
            if ($dx >= 0 && $dx < $w && $dy >= 0 && $dy < $h) {
                continue; // клетка на основании — на ней не стоят
            }
            $seen["{$dx},{$dy}"] = true;
            $cells[] = ['dx' => $dx, 'dy' => $dy];
        }
        usort($cells, fn (array $a, array $b): int => [$a['dy'], $a['dx']] <=> [$b['dy'], $b['dx']]);

        return $cells;
    }

    /**
     * @return array<string, array{sheet: string, sx: int, sy: int}>
     */
    private static function stateFields(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $states = [];
        foreach ($raw as $item) {
            if (! is_array($item)) {
                continue;
            }
            $name = $item['name'] ?? null;
            $sheet = $item['sheet'] ?? null;
            $sx = $item['sx'] ?? null;
            $sy = $item['sy'] ?? null;
            if (! is_string($name) || ! is_string($sheet) || ! is_int($sx) || ! is_int($sy)) {
                continue;
            }
            $states[$name] = ['sheet' => $sheet, 'sx' => $sx, 'sy' => $sy];
        }
        ksort($states);

        return $states;
    }

    private function validatedDefaultState(): ?string
    {
        $value = $this->input('defaultState');

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function validatedBehavior(): ?string
    {
        $value = $this->input('behavior');

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @return array{slug: string, label: string, description: string, default_state: string|null, behavior: string|null}
     */
    public function typeFields(): array
    {
        $description = $this->input('description');

        return [
            'slug' => $this->string('slug')->toString(),
            'label' => $this->string('label')->toString(),
            'description' => is_string($description) ? $description : '',
            'default_state' => $this->validatedDefaultState(),
            'behavior' => $this->validatedBehavior(),
        ];
    }

    /**
     * @return list<int>
     */
    public function categoryIds(): array
    {
        $raw = $this->input('categoryIds');
        if (! is_array($raw)) {
            return [];
        }

        $ids = [];
        foreach ($raw as $id) {
            if (is_int($id)) {
                $ids[] = $id;
            }
        }

        return $ids;
    }
}
