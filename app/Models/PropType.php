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
     * @return array<string, array<string, mixed>>
     */
    public static function catalogue(): array
    {
        return self::query()
            ->orderBy('id')
            ->get()
            ->keyBy('slug')
            ->map(fn (self $type) => $type->only(['label', 'sheet', 'sx', 'sy', 'w', 'h', 'tall']))
            ->all();
    }
}
