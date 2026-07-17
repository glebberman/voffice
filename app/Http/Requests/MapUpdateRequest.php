<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class MapUpdateRequest extends FormRequest
{
    private const WALKABLE = ['.', ':', ',', ';', '*'];

    public function authorize(): bool
    {
        return (bool) $this->user()?->is_admin;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:60'],
            'map' => ['required', 'array'],
            'map.rows' => ['required', 'array', 'min:1', 'max:64'],
            'map.rows.*' => ['required', 'string', 'max:64'],
            'map.spawn' => ['required', 'array'],
            'map.spawn.x' => ['required', 'integer', 'min:0'],
            'map.spawn.y' => ['required', 'integer', 'min:0'],
            'map.zones' => ['present', 'array'],
            'map.objects' => ['present', 'array'],
            'map.objects.*.id' => ['required', 'string', 'max:64'],
            'map.objects.*.type' => ['required', 'string', 'in:board,video,map,link'],
            'map.objects.*.label' => ['required', 'string', 'max:80'],
            'map.objects.*.url' => ['required', 'url', 'max:500'],
            'map.objects.*.x' => ['required', 'integer', 'min:0'],
            'map.objects.*.y' => ['required', 'integer', 'min:0'],
            'map.portals' => ['present', 'array'],
            'map.portals.*.x' => ['required', 'integer', 'min:0'],
            'map.portals.*.y' => ['required', 'integer', 'min:0'],
            'map.portals.*.to' => ['required', 'string', 'exists:rooms,slug'],
            'map.portals.*.label' => ['required', 'string', 'max:80'],
            'map.portals.*.tx' => ['required', 'integer', 'min:0'],
            'map.portals.*.ty' => ['required', 'integer', 'min:0'],
        ];
    }

    // геометрическая целостность карты — то же, что проверяют js-тесты
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $map = $this->input('map');
                if (! is_array($map) || ! is_array($map['rows'] ?? null)) {
                    return;
                }

                $rows = $map['rows'];
                $width = strlen($rows[0]);
                $height = count($rows);

                foreach ($rows as $i => $row) {
                    if (strlen($row) !== $width) {
                        $validator->errors()->add('map.rows', "Строка {$i} другой ширины ({$width} ожидалось)");
                    }
                }

                $inBounds = fn ($x, $y) => $x >= 0 && $y >= 0 && $x < $width && $y < $height;

                $sx = $map['spawn']['x'] ?? -1;
                $sy = $map['spawn']['y'] ?? -1;
                if (! $inBounds($sx, $sy) || ! in_array($rows[$sy][$sx] ?? '#', self::WALKABLE, true)) {
                    $validator->errors()->add('map.spawn', 'Точка спавна должна быть на проходимой клетке');
                }

                foreach ($map['objects'] ?? [] as $i => $obj) {
                    if (! $inBounds($obj['x'] ?? -1, $obj['y'] ?? -1)) {
                        $validator->errors()->add("map.objects.{$i}", 'Объект за пределами карты');
                    }
                }
                foreach ($map['portals'] ?? [] as $i => $portal) {
                    if (! $inBounds($portal['x'] ?? -1, $portal['y'] ?? -1)) {
                        $validator->errors()->add("map.portals.{$i}", 'Портал за пределами карты');
                    }
                }
            },
        ];
    }
}
