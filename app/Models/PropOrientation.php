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
 * (как у Room::$map): словарь «имя состояния → регион», форму значений
 * гарантирует PropTypeRequest, а читает их stateRegions().
 *
 * @property array<string, mixed> $states
 */
class PropOrientation extends Model
{
    /** Канонический порядок сторон; south — дефолт (LPC-спрайты смотрят на юг). */
    public const DIRS = ['south', 'west', 'east', 'north'];

    protected $fillable = ['prop_type_id', 'dir', 'sheet', 'sx', 'sy', 'w', 'h', 'tall', 'states'];

    protected function casts(): array
    {
        return [
            'sx' => 'integer',
            'sy' => 'integer',
            'w' => 'integer',
            'h' => 'integer',
            'tall' => 'integer',
            'states' => 'array',
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
     * @return BelongsTo<PropType, $this>
     */
    public function propType(): BelongsTo
    {
        return $this->belongsTo(PropType::class);
    }
}
