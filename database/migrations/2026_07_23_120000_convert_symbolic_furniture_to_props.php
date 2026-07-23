<?php

use App\Models\PropType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Символьная мебель (тайлы D/K/T/S/P) — рудимент времён до каталога: рисовалась
 * процедурно, в обход предметов, без спрайтов, поворотов и поведений. Переводим
 * её на предметы каталога и убираем символы из карты (клетки становятся полом).
 *
 * Соответствие:
 *   D → desk (3×1, ряды заполняем столами слева направо)
 *   S → sofa (2×1)
 *   K → kitchen-counter (1×1, по стойке на клетку)
 *   T → meeting-table боком (1×2, вертикальными парами)
 *   P → пол (растения убираем — спрайта нет)
 * Остаток ряда/блока, не покрытый предметом, становится полом.
 *
 * На пустой базе (свежая установка) миграция ничего не делает: RoomSeeder грузит
 * уже сконвертированные resources/maps/*.json, символов там нет.
 */
return new class extends Migration
{
    private int $seq = 0;

    public function up(): void
    {
        foreach (DB::table('rooms')->orderBy('id')->get() as $room) {
            $map = $this->readMap($room->map);
            if ($map === null) {
                continue;
            }
            $converted = $this->convert($map);
            if ($converted !== null) {
                DB::table('rooms')->where('id', $room->id)->update([
                    'map' => json_encode($converted, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
            }
        }
    }

    public function down(): void
    {
        // Необратимо: свободная символьная заливка не восстанавливается из
        // предметов фиксированного размера один в один. Откат — пересев карт из
        // git-версии resources/maps/*.json (в них символы уже убраны, так что
        // откат этой миграции возвращает состояние «уже без символов»).
    }

    /**
     * @param  array<string, mixed>  $map
     * @return array<string, mixed>|null null — если конвертировать нечего
     */
    private function convert(array $map): ?array
    {
        $rows = $map['rows'] ?? null;
        if (! is_array($rows) || ! is_string($rows[0] ?? null)) {
            return null;
        }
        /** @var list<string> $rows */
        $height = count($rows);
        $width = strlen($rows[0]);
        $grid = array_map(fn (string $r): array => mb_str_split($r), $rows);

        $has = false;
        foreach ($grid as $line) {
            foreach ($line as $ch) {
                if (in_array($ch, ['D', 'K', 'T', 'S', 'P'], true)) {
                    $has = true;
                    break 2;
                }
            }
        }
        if (! $has) {
            return null;
        }

        $catalogue = PropType::catalogue();
        $props = [];
        foreach (is_array($map['props'] ?? null) ? $map['props'] : [] as $prop) {
            $props[] = $prop;
        }

        // Клетки, уже занятые предметами (в т.ч. доски из VOF-33, которые стоят
        // ровно на символьных тайлах): туда мебель не ставим, чтобы не наложить.
        $occupied = [];
        foreach ($props as $prop) {
            if (! is_array($prop)) {
                continue;
            }
            foreach ($this->footprint($catalogue, $prop) as $cell) {
                $occupied[$cell] = true;
            }
        }

        $at = fn (int $x, int $y): string => ($y >= 0 && $y < $height && $x >= 0 && $x < $width) ? $grid[$y][$x] : '#';

        // Пытается поставить предмет: проверяет границы, воздух сверху и
        // незанятость всех клеток основания. Кладёт и помечает занятыми, если ок.
        $place = function (string $type, int $x, int $y, ?string $dir) use (&$props, &$occupied, $catalogue, $width, $height): bool {
            $o = $this->orient($catalogue[$type] ?? null, $dir);
            if ($o === null || $x + $o['w'] > $width || $y + $o['h'] > $height || $y - $o['tall'] < 0) {
                return false;
            }
            $cells = [];
            for ($dy = 0; $dy < $o['h']; $dy++) {
                for ($dx = 0; $dx < $o['w']; $dx++) {
                    $cell = ($x + $dx).':'.($y + $dy);
                    if (isset($occupied[$cell])) {
                        return false;
                    }
                    $cells[] = $cell;
                }
            }
            foreach ($cells as $cell) {
                $occupied[$cell] = true;
            }
            $props[] = $this->prop($type, $x, $y, $dir);

            return true;
        };

        // D и S — горизонтальные ряды, заполняем предметом фиксированной ширины
        foreach ([['D', 'desk', 3], ['S', 'sofa', 2]] as [$sym, $type, $w]) {
            for ($y = 0; $y < $height; $y++) {
                $x = 0;
                while ($x < $width) {
                    if ($at($x, $y) !== $sym) {
                        $x++;

                        continue;
                    }
                    $start = $x;
                    while ($at($x, $y) === $sym) {
                        $x++;
                    }
                    for ($px = $start; $px + $w <= $x; $px += $w) {
                        $place($type, $px, $y, null);
                    }
                }
            }
        }

        // T — блоки высотой кратно 2, ставим стол боком (1×2) по столбцам
        for ($x = 0; $x < $width; $x++) {
            $y = 0;
            while ($y < $height) {
                if ($at($x, $y) !== 'T') {
                    $y++;

                    continue;
                }
                $start = $y;
                while ($at($x, $y) === 'T') {
                    $y++;
                }
                for ($py = $start; $py + 2 <= $y; $py += 2) {
                    $place('meeting-table', $x, $py, 'east');
                }
            }
        }

        // K — по стойке на каждую клетку
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                if ($at($x, $y) === 'K') {
                    $place('kitchen-counter', $x, $y, null);
                }
            }
        }

        // Символы убираем: под мебелью остаётся пол своей зоны — K/T/S несли и
        // цвет пола (кухня/переговорка/лаунж), D/P стояли на обычном полу.
        $floorOf = ['K' => ':', 'T' => ',', 'S' => ';', 'D' => '.', 'P' => '.'];
        foreach ($grid as $y => $line) {
            foreach ($line as $x => $ch) {
                if (isset($floorOf[$ch])) {
                    $grid[$y][$x] = $floorOf[$ch];
                }
            }
        }

        $map['rows'] = array_map(fn (array $line): string => implode('', $line), $grid);
        $map['props'] = $props;

        return $map;
    }

    /**
     * Клетки основания предмета — по каталогу; пусто, если тип осиротел.
     *
     * @param  array<mixed, mixed>  $catalogue
     * @param  array<mixed, mixed>  $prop
     * @return list<string>
     */
    private function footprint(array $catalogue, array $prop): array
    {
        $type = $prop['type'] ?? null;
        $dir = is_string($prop['dir'] ?? null) ? $prop['dir'] : null;
        $o = is_string($type) ? $this->orient($catalogue[$type] ?? null, $dir) : null;
        if ($o === null) {
            return [];
        }
        $x = is_int($prop['x'] ?? null) ? $prop['x'] : 0;
        $y = is_int($prop['y'] ?? null) ? $prop['y'] : 0;
        $cells = [];
        for ($dy = 0; $dy < $o['h']; $dy++) {
            for ($dx = 0; $dx < $o['w']; $dx++) {
                $cells[] = ($x + $dx).':'.($y + $dy);
            }
        }

        return $cells;
    }

    /**
     * Геометрия стороны предмета (w/h/tall) — loose-чтение каталога с тем же
     * фолбэком, что PropType::orientationOf (запрошенная сторона → south →
     * первая). null — если спеки/ориентаций нет.
     *
     * @return array{w: int, h: int, tall: int}|null
     */
    private function orient(mixed $spec, ?string $dir): ?array
    {
        $orientations = is_array($spec) && is_array($spec['orientations'] ?? null) ? $spec['orientations'] : null;
        if ($orientations === null) {
            return null;
        }
        $o = null;
        if ($dir !== null && is_array($orientations[$dir] ?? null)) {
            $o = $orientations[$dir];
        } elseif (is_array($orientations['south'] ?? null)) {
            $o = $orientations['south'];
        } else {
            foreach ($orientations as $candidate) {
                if (is_array($candidate)) {
                    $o = $candidate;
                    break;
                }
            }
        }
        if (! is_array($o)) {
            return null;
        }

        return [
            'w' => is_int($o['w'] ?? null) ? $o['w'] : 1,
            'h' => is_int($o['h'] ?? null) ? $o['h'] : 1,
            'tall' => is_int($o['tall'] ?? null) ? $o['tall'] : 0,
        ];
    }

    /**
     * @return array{id: string, type: string, x: int, y: int, dir?: string}
     */
    private function prop(string $type, int $x, int $y, ?string $dir = null): array
    {
        $prop = ['id' => "furn-{$type}-{$x}-{$y}-".$this->seq++, 'type' => $type, 'x' => $x, 'y' => $y];
        if ($dir !== null) {
            $prop['dir'] = $dir;
        }

        return $prop;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readMap(mixed $raw): ?array
    {
        if (! is_string($raw)) {
            return null;
        }
        $map = json_decode($raw, true);
        if (! is_array($map)) {
            return null;
        }
        $fields = [];
        foreach ($map as $key => $value) {
            $fields[(string) $key] = $value;
        }

        return $fields;
    }
};
