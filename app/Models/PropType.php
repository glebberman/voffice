<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Тип предмета обстановки: имя и набор ориентаций (регион спрайта и геометрия
 * каждой стороны — в prop_orientations). Карты ссылаются на него по `slug`,
 * ориентация выбирается полем `dir` предмета на карте.
 *
 * Состояния (телевизор включён / выключен) — именованные регионы поверх
 * ориентации: имена общие для всех сторон типа, геометрия — от ориентации.
 * `default_state` — что рисуется по умолчанию; null = состояний нет.
 *
 * Категории (две оси, many-to-many) и описание — витрина каталога в
 * редакторе карт: карточка с картинкой, описанием и группировками.
 *
 * @phpstan-type StateRegion array{sheet: string, sx: int, sy: int}
 * @phpstan-type OrientationSpec array{sheet: string, sx: int, sy: int, w: int, h: int, tall: int, states: array<string, StateRegion>}
 * @phpstan-type PropSpec array{label: string, description: string, defaultState: string|null, purposes: list<string>, roomKinds: list<string>, orientations: array<string, OrientationSpec>}
 */
class PropType extends Model
{
    protected $fillable = ['slug', 'label', 'default_state', 'description'];

    /**
     * @return HasMany<PropOrientation, $this>
     */
    public function orientations(): HasMany
    {
        return $this->hasMany(PropOrientation::class);
    }

    /**
     * @return BelongsToMany<PropCategory, $this>
     */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(PropCategory::class);
    }

    /**
     * Слоги категорий одной оси — в порядке sort, затем slug: так каталог и
     * экспорт не зависят от порядка привязки.
     *
     * @return list<string>
     */
    public function categorySlugs(string $axis): array
    {
        $ofAxis = $this->categories->filter(fn (PropCategory $c): bool => $c->axis === $axis)->all();
        usort($ofAxis, fn (PropCategory $a, PropCategory $b): int => [$a->sort, $a->slug] <=> [$b->sort, $b->slug]);

        return array_map(fn (PropCategory $c): string => $c->slug, $ofAxis);
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
        foreach (self::query()->with(['orientations', 'categories'])->orderBy('id')->get() as $type) {
            $orientations = [];
            foreach ($type->sortedOrientations() as $orientation) {
                $orientations[$orientation->dir] = [
                    'sheet' => $orientation->sheet,
                    'sx' => $orientation->sx,
                    'sy' => $orientation->sy,
                    'w' => $orientation->w,
                    'h' => $orientation->h,
                    'tall' => $orientation->tall,
                    'states' => $orientation->stateRegions(),
                ];
            }
            $catalogue[$type->slug] = [
                'label' => $type->label,
                'description' => $type->description,
                'defaultState' => $type->default_state,
                'purposes' => $type->categorySlugs('purpose'),
                'roomKinds' => $type->categorySlugs('room'),
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
