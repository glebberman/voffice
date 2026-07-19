<?php

namespace App\Http\Requests;

use App\Models\PropType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class MapUpdateRequest extends FormRequest
{
    private const WALKABLE = ['.', ':', ',', ';', '*'];

    public function authorize(): bool
    {
        return (bool) $this->user()?->is_admin;
    }

    /**
     * Кеш на время запроса: каталог читается дважды.
     *
     * @var array<string, array{label: string, sheet: string, sx: int, sy: int, w: int, h: int, tall: int}>|null
     */
    private ?array $catalogue = null;

    /**
     * Каталог предметов — тот же, что уезжает клиенту (game/props.ts).
     *
     * @return array<string, array{label: string, sheet: string, sx: int, sy: int, w: int, h: int, tall: int}>
     */
    private function propCatalogue(): array
    {
        return $this->catalogue ??= PropType::catalogue();
    }

    /**
     * Строки карты — если они действительно массив строк.
     *
     * Здесь мы работаем с сырым вводом: правила из rules() могли не пройти, и
     * тогда в map лежит что угодно. Возвращаем null — проверять геометрию
     * нечего, об ошибке уже сообщат правила.
     *
     * @return list<string>|null
     */
    private function mapRows(): ?array
    {
        $map = $this->input('map');
        if (! is_array($map) || ! is_array($map['rows'] ?? null)) {
            return null;
        }

        $rows = [];
        foreach ($map['rows'] as $row) {
            if (! is_string($row)) {
                return null;
            }
            $rows[] = $row;
        }

        return $rows === [] ? null : $rows;
    }

    /**
     * Список из карты (objects, portals, doors, props) — всегда массив.
     *
     * @return list<mixed>
     */
    private function mapList(string $key): array
    {
        $map = $this->input('map');
        $items = is_array($map) ? ($map[$key] ?? []) : [];

        return is_array($items) ? array_values($items) : [];
    }

    /**
     * Координаты элемента карты. Всё, что не целое число, считаем промахом
     * мимо карты: −1 не пройдёт проверку границ.
     *
     * @return array{int, int}
     */
    private static function pointOf(mixed $item): array
    {
        if (! is_array($item)) {
            return [-1, -1];
        }
        $x = $item['x'] ?? null;
        $y = $item['y'] ?? null;

        return [is_int($x) ? $x : -1, is_int($y) ? $y : -1];
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:60'],
            'map' => ['required', 'array'],
            // Предел 512×512 = 262 тыс. тайлов. Выше — уже неадекватно по памяти
            // клиента; ниже упираться незачем: канвас-вьюпорт и чанковый рендер
            // не зависят от размера карты.
            'map.rows' => ['required', 'array', 'min:1', 'max:512'],
            'map.rows.*' => ['required', 'string', 'max:512'],
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
            // предметы обстановки: тип берётся из каталога resources/props.json,
            // размеры оттуда же — в карте хранится только тип и позиция
            'map.props' => ['sometimes', 'array', 'max:2000'],
            'map.props.*.id' => ['required', 'string', 'max:64'],
            'map.props.*.type' => ['required', 'string', Rule::in(array_keys($this->propCatalogue()))],
            'map.props.*.x' => ['required', 'integer', 'min:0'],
            'map.props.*.y' => ['required', 'integer', 'min:0'],
            // двери: стоят на проходимом тайле, замок — на одной из сторон
            'map.doors' => ['sometimes', 'array', 'max:500'],
            'map.doors.*.id' => ['required', 'string', 'max:64'],
            'map.doors.*.x' => ['required', 'integer', 'min:0'],
            'map.doors.*.y' => ['required', 'integer', 'min:0'],
            'map.doors.*.lock' => ['present', 'nullable', 'string', 'in:north,south,west,east'],
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
    /**
     * @return list<callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $rows = $this->mapRows();
                if ($rows === null) {
                    return; // структуру уже забраковали правила из rules()
                }

                $width = strlen($rows[0]);
                $height = count($rows);

                foreach ($rows as $i => $row) {
                    if (strlen($row) !== $width) {
                        $validator->errors()->add('map.rows', "Строка {$i} другой ширины ({$width} ожидалось)");
                    }
                }

                $inBounds = fn (int $x, int $y): bool => $x >= 0 && $y >= 0 && $x < $width && $y < $height;
                $walkable = fn (int $x, int $y): bool => in_array($rows[$y][$x] ?? '#', self::WALKABLE, true);

                [$sx, $sy] = self::pointOf($this->input('map.spawn'));
                if (! $inBounds($sx, $sy) || ! $walkable($sx, $sy)) {
                    $validator->errors()->add('map.spawn', 'Точка спавна должна быть на проходимой клетке');
                }

                foreach ($this->mapList('objects') as $i => $obj) {
                    [$x, $y] = self::pointOf($obj);
                    if (! $inBounds($x, $y)) {
                        $validator->errors()->add("map.objects.{$i}", 'Объект за пределами карты');
                    }
                }

                foreach ($this->mapList('portals') as $i => $portal) {
                    [$x, $y] = self::pointOf($portal);
                    if (! $inBounds($x, $y)) {
                        $validator->errors()->add("map.portals.{$i}", 'Портал за пределами карты');
                    }
                }

                // дверь должна стоять на проходимой клетке — иначе через неё
                // никогда не пройти, и она просто ломает связность карты
                $seenDoors = [];
                foreach ($this->mapList('doors') as $i => $doorItem) {
                    [$x, $y] = self::pointOf($doorItem);
                    if (! $inBounds($x, $y) || ! $walkable($x, $y)) {
                        $validator->errors()->add("map.doors.{$i}", 'Дверь должна стоять на проходимой клетке');

                        continue;
                    }
                    $key = $x.':'.$y;
                    if (isset($seenDoors[$key])) {
                        $validator->errors()->add("map.doors.{$i}", 'На этой клетке уже есть дверь');
                    }
                    $seenDoors[$key] = true;
                }

                // предмет должен целиком помещаться: и основание, и часть в воздухе
                $catalogue = $this->propCatalogue();
                foreach ($this->mapList('props') as $i => $prop) {
                    $type = is_array($prop) ? ($prop['type'] ?? null) : null;
                    $spec = is_string($type) ? ($catalogue[$type] ?? null) : null;
                    if ($spec === null) {
                        continue; // недопустимый тип уже поймали правила выше
                    }
                    [$x, $y] = self::pointOf($prop);
                    if (! $inBounds($x, $y) || ! $inBounds($x + $spec['w'] - 1, $y + $spec['h'] - 1)) {
                        $validator->errors()->add("map.props.{$i}", 'Предмет за пределами карты');
                    } elseif ($y - $spec['tall'] < 0) {
                        $validator->errors()->add("map.props.{$i}", 'Высокой части предмета не хватает места сверху');
                    }
                }
            },
        ];
    }
}
