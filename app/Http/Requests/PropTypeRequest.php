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
                'required', 'string', 'max:64', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('prop_types', 'slug')->ignore($type),
            ],
            'label' => ['required', 'string', 'max:80'],
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
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'Ключ — латиница в нижнем регистре, цифры и дефис',
            'slug.unique' => 'Такой ключ уже есть в каталоге',
            'orientations.*.dir.distinct' => 'Сторона повторяется',
        ];
    }

    // регион каждой ориентации не должен вылезать за пределы своего листа
    /**
     * @return list<callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach ($this->orientationFields() as $i => $orientation) {
                    $size = SpriteSheets::size($orientation['sheet']);
                    if (! $size) {
                        continue;
                    }

                    $right = $orientation['sx'] + $orientation['w'] * self::TILE;
                    $bottom = $orientation['sy'] + ($orientation['h'] + $orientation['tall']) * self::TILE;

                    if ($right > $size['width'] || $bottom > $size['height']) {
                        $validator->errors()->add(
                            "orientations.{$i}.sheet",
                            "Регион вылезает за лист ({$size['width']}×{$size['height']} px)",
                        );
                    }
                }
            },
        ];
    }

    /**
     * Ориентации из запроса в известной форме. Элементы, не прошедшие правила
     * из rules(), молча пропускаются — о них уже сообщила валидация.
     *
     * @return list<array{dir: string, sheet: string, sx: int, sy: int, w: int, h: int, tall: int}>
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
            $out[] = ['dir' => $dir, 'sheet' => $sheet, 'sx' => $sx, 'sy' => $sy, 'w' => $w, 'h' => $h, 'tall' => $tall];
        }

        return $out;
    }

    /**
     * @return array{slug: string, label: string}
     */
    public function typeFields(): array
    {
        return [
            'slug' => $this->string('slug')->toString(),
            'label' => $this->string('label')->toString(),
        ];
    }
}
