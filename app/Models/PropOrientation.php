<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Ориентация предмета: регион спрайта на листе и геометрия «основание /
 * висит в воздухе» для одной из сторон. У повёрнутого предмета меняется не
 * только картинка, но и footprint, поэтому w/h/tall живут здесь, а не на типе.
 *
 * Larastan выводит тип json-колонки как string, поэтому форму описываем сами
 * (как у Room::$map): словарь «имя состояния → регион» и список клеток зоны
 * взаимодействия; форму значений гарантирует PropTypeRequest, а читают их
 * stateRegions() и interactionCells().
 *
 * @property array<string, mixed> $states
 * @property array<int, mixed> $interaction
 */
class PropOrientation extends Model
{
    /** Канонический порядок сторон; south — дефолт (LPC-спрайты смотрят на юг). */
    public const DIRS = ['south', 'west', 'east', 'north'];

    protected $fillable = ['prop_type_id', 'dir', 'sheet', 'sx', 'sy', 'w', 'h', 'tall', 'states', 'interaction'];

    protected function casts(): array
    {
        return [
            'sx' => 'integer',
            'sy' => 'integer',
            'w' => 'integer',
            'h' => 'integer',
            'tall' => 'integer',
            'states' => 'array',
            'interaction' => 'array',
        ];
    }

    /**
     * Регионы состояний в известной форме, отсортированные по имени — чтобы
     * каталог и экспорт не зависели от порядка записи. Формой на записи
     * управляет PropTypeRequest, поэтому несоответствие просто пропускаем.
     *
     * @return array<string, array{sheet: string, sx: int, sy: int}>
     */
    public function stateRegions(): array
    {
        $regions = [];
        foreach ($this->states as $name => $region) {
            if (! is_array($region)) {
                continue;
            }
            $sheet = $region['sheet'] ?? null;
            $sx = $region['sx'] ?? null;
            $sy = $region['sy'] ?? null;
            if (! is_string($sheet) || ! is_int($sx) || ! is_int($sy)) {
                continue;
            }
            $regions[(string) $name] = ['sheet' => $sheet, 'sx' => $sx, 'sy' => $sy];
        }
        ksort($regions);

        return $regions;
    }

    /**
     * Клетки зоны взаимодействия в известной форме: смещения `{dx, dy}` от
     * origin, без дублей, отсортированные по (dy, dx) — чтобы каталог и экспорт
     * не зависели от порядка записи. Формой на записи управляет PropTypeRequest,
     * поэтому несоответствие просто пропускаем.
     *
     * @return list<array{dx: int, dy: int}>
     */
    public function interactionCells(): array
    {
        $seen = [];
        $cells = [];
        foreach ($this->interaction as $cell) {
            if (! is_array($cell)) {
                continue;
            }
            $dx = $cell['dx'] ?? null;
            $dy = $cell['dy'] ?? null;
            if (! is_int($dx) || ! is_int($dy)) {
                continue;
            }
            $key = "{$dx},{$dy}";
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $cells[] = ['dx' => $dx, 'dy' => $dy];
        }
        usort($cells, fn (array $a, array $b): int => [$a['dy'], $a['dx']] <=> [$b['dy'], $b['dx']]);

        return $cells;
    }

    /**
     * @return BelongsTo<PropType, $this>
     */
    public function propType(): BelongsTo
    {
        return $this->belongsTo(PropType::class);
    }
}
