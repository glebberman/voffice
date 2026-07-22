<?php

namespace App\Http\Requests;

use App\Models\PropOrientation;
use App\Models\PropType;
use App\Support\MapLimits;
use App\Support\PropBehaviors;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * @phpstan-import-type OrientationSpec from PropType
 * @phpstan-import-type PropSpec from PropType
 */
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
     * @var array<string, PropSpec>|null
     */
    private ?array $catalogue = null;

    /**
     * Каталог предметов — тот же, что уезжает клиенту (game/props.ts).
     *
     * @return array<string, PropSpec>
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
     * Список из карты (portals, doors, props) — всегда массив.
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
            'map.rows' => ['required', 'array', 'min:1', 'max:'.MapLimits::MAX_SIZE],
            'map.rows.*' => ['required', 'string', 'max:'.MapLimits::MAX_SIZE],
            'map.spawn' => ['required', 'array'],
            'map.spawn.x' => ['required', 'integer', 'min:0'],
            'map.spawn.y' => ['required', 'integer', 'min:0'],
            // зоны: прямоугольники помещений (переговорка/кухня/…); приватная
            // зона отсекает чат снаружи, kind — тип помещения (задел под стили)
            'map.zones' => ['present', 'array'],
            'map.zones.*.name' => ['required', 'string', 'max:60'],
            'map.zones.*.x1' => ['required', 'integer', 'min:0'],
            'map.zones.*.y1' => ['required', 'integer', 'min:0'],
            'map.zones.*.x2' => ['required', 'integer', 'min:0'],
            'map.zones.*.y2' => ['required', 'integer', 'min:0'],
            'map.zones.*.isPrivate' => ['sometimes', 'boolean'],
            'map.zones.*.kind' => ['sometimes', 'string', 'max:32'],
            // предметы обстановки: тип берётся из каталога resources/props.json,
            // размеры оттуда же — в карте хранится только тип и позиция
            'map.props' => ['sometimes', 'array', 'max:2000'],
            // id уникален: по нему адресуются состояния (prop_states) и спрайты
            // в сцене — дубль означал бы, что переключают не тот предмет
            'map.props.*.id' => ['required', 'string', 'max:64', 'distinct'],
            'map.props.*.type' => ['required', 'string', Rule::in(array_keys($this->propCatalogue()))],
            'map.props.*.x' => ['required', 'integer', 'min:0'],
            'map.props.*.y' => ['required', 'integer', 'min:0'],
            // сторона, которой стоит предмет; отсутствие означает south
            'map.props.*.dir' => ['sometimes', 'string', Rule::in(PropOrientation::DIRS)],
            // настройки инстанса поведения (embed → {label, url}); форму по
            // поведению типа проверяет after() через PropBehaviors
            'map.props.*.settings' => ['sometimes', 'array'],
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

                // зона — прямоугольник в границах карты, углы не перевёрнуты
                foreach ($this->mapList('zones') as $i => $zone) {
                    if (! is_array($zone)) {
                        continue;
                    }
                    $x1 = is_int($zone['x1'] ?? null) ? $zone['x1'] : -1;
                    $y1 = is_int($zone['y1'] ?? null) ? $zone['y1'] : -1;
                    $x2 = is_int($zone['x2'] ?? null) ? $zone['x2'] : -1;
                    $y2 = is_int($zone['y2'] ?? null) ? $zone['y2'] : -1;
                    if (! $inBounds($x1, $y1) || ! $inBounds($x2, $y2)) {
                        $validator->errors()->add("map.zones.{$i}", 'Зона за пределами карты');
                    } elseif ($x2 < $x1 || $y2 < $y1) {
                        $validator->errors()->add("map.zones.{$i}", 'У зоны правый-нижний угол левее/выше левого-верхнего');
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

                    // настройки инстанса — по поведению типа (embed → {label, url});
                    // отсутствие настроек допустимо: предмет просто неинтерактивен.
                    // Проверяем до геометрии: ниже есть continue-ветки, а настройки
                    // от ориентации не зависят ($prop здесь уже массив — иначе $spec был бы null)
                    $settings = $prop['settings'] ?? null;
                    if ($settings !== null) {
                        foreach (PropBehaviors::settingsErrors($spec['behavior'], $settings) as $message) {
                            $validator->errors()->add("map.props.{$i}.settings", $message);
                        }
                    }
                    $dirRaw = $prop['dir'] ?? null;
                    $dir = is_string($dirRaw) ? $dirRaw : null;
                    if ($dir !== null && ! isset($spec['orientations'][$dir])) {
                        $validator->errors()->add("map.props.{$i}.dir", 'У предмета нет такой ориентации');

                        continue;
                    }
                    $orientation = PropType::orientationOf($spec, $dir);
                    if ($orientation === null) {
                        continue; // тип без ориентаций каталог не отдаёт
                    }
                    [$x, $y] = self::pointOf($prop);
                    if (! $inBounds($x, $y) || ! $inBounds($x + $orientation['w'] - 1, $y + $orientation['h'] - 1)) {
                        $validator->errors()->add("map.props.{$i}", 'Предмет за пределами карты');
                    } elseif ($y - $orientation['tall'] < 0) {
                        $validator->errors()->add("map.props.{$i}", 'Высокой части предмета не хватает места сверху');
                    }
                }
            },
        ];
    }
}
