<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Тип предмета обстановки: имя и набор ориентаций (регион спрайта и геометрия
 * каждой стороны — в prop_orientations). Карты ссылаются на него по `slug`,
 * ориентация выбирается полем `dir` предмета на карте.
 *
 * @phpstan-type OrientationSpec array{sheet: string, sx: int, sy: int, w: int, h: int, tall: int}
 * @phpstan-type PropSpec array{label: string, orientations: array<string, OrientationSpec>}
 */
class PropType extends Model
{
    protected $fillable = ['slug', 'label'];

    /**
     * @return HasMany<PropOrientation, $this>
     */
    public function orientations(): HasMany
    {
        return $this->hasMany(PropOrientation::class);
    }

    /**
     * Каталог в том же виде, в каком его ждут клиент (game/props.ts) и
     * валидация карты: словарь slug → спека с ориентациями.
     *
     * Поля перечислены руками, а не через only(): так тип спеки известен
     * точно, и проверки геометрии не работают с mixed.
     *
     * @return array<string, PropSpec>
     */
    public static function catalogue(): array
    {
        // обычный цикл, а не keyBy()->map(): коллекция теряет форму значения,
        // и на выходе снова получается mixed
        $catalogue = [];
        foreach (self::query()->with('orientations')->orderBy('id')->get() as $type) {
            $orientations = [];
            foreach ($type->sortedOrientations() as $orientation) {
                $orientations[$orientation->dir] = [
                    'sheet' => $orientation->sheet,
                    'sx' => $orientation->sx,
                    'sy' => $orientation->sy,
                    'w' => $orientation->w,
                    'h' => $orientation->h,
                    'tall' => $orientation->tall,
                ];
            }
            $catalogue[$type->slug] = [
                'label' => $type->label,
                'orientations' => $orientations,
            ];
        }

        return $catalogue;
    }

    /**
     * Ориентации в каноническом порядке сторон — чтобы каталог и экспорт не
     * зависели от порядка вставки строк.
     *
     * @return list<PropOrientation>
     */
    public function sortedOrientations(): array
    {
        $orientations = $this->orientations->all();
        usort(
            $orientations,
            fn (PropOrientation $a, PropOrientation $b): int => array_search($a->dir, PropOrientation::DIRS, true) <=> array_search($b->dir, PropOrientation::DIRS, true),
        );

        return $orientations;
    }
}
