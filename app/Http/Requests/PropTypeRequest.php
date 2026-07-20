<?php

namespace App\Http\Requests;

use App\Models\PropOrientation;
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
            // slug — ключ, которым предмет назван в картах; менять его у
            // существующего типа нельзя, иначе карты потеряют свои предметы
            'slug' => [
                'required', 'string', 'max:64', 'regex:'.self::NAME_REGEX,
                Rule::unique('prop_types', 'slug')->ignore($type),
            ],
            'label' => ['required', 'string', 'max:80'],
            // что рисуется, пока предметом не пользуются; null = состояний нет
            'defaultState' => ['present', 'nullable', 'string', 'max:64', 'regex:'.self::NAME_REGEX],
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
                $names = null;

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
     * @return list<array{dir: string, sheet: string, sx: int, sy: int, w: int, h: int, tall: int, states: array<string, array{sheet: string, sx: int, sy: int}>}>
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
            ];
        }

        return $out;
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

    /**
     * @return array{slug: string, label: string, default_state: string|null}
     */
    public function typeFields(): array
    {
        return [
            'slug' => $this->string('slug')->toString(),
            'label' => $this->string('label')->toString(),
            'default_state' => $this->validatedDefaultState(),
        ];
    }
}
