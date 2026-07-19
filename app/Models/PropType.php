<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Тип предмета обстановки: регион спрайта на листе плюс разметка «основание /
 * висит в воздухе». Карты ссылаются на него по `slug`.
 */
class PropType extends Model
{
    protected $fillable = ['slug', 'label', 'sheet', 'sx', 'sy', 'w', 'h', 'tall'];

    protected function casts(): array
    {
        return [
            'sx' => 'integer',
            'sy' => 'integer',
            'w' => 'integer',
            'h' => 'integer',
            'tall' => 'integer',
        ];
    }

    /**
     * Каталог в том же виде, в каком его ждут клиент (game/props.ts) и
     * валидация карты: словарь slug → спека.
     *
     * Поля перечислены руками, а не через only(): так тип спеки известен
     * точно, и проверки геометрии не работают с mixed.
     *
     * @return array<string, array{label: string, sheet: string, sx: int, sy: int, w: int, h: int, tall: int}>
     */
    public static function catalogue(): array
    {
        return self::query()
            ->orderBy('id')
            ->get()
            ->keyBy('slug')
            ->map(fn (self $type) => [
                'label' => $type->label,
                'sheet' => $type->sheet,
                'sx' => $type->sx,
                'sy' => $type->sy,
                'w' => $type->w,
                'h' => $type->h,
                'tall' => $type->tall,
            ])
            ->all();
    }
}
