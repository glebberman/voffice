<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Карта комнаты — JSON заданной формы (см. docs/reference/format-karty.md).
 * Larastan выводит тип json-колонки как string, поэтому форму описываем сами:
 * заодно видно, что вообще лежит в rooms.map.
 *
 * @property array{
 *     rows: list<string>,
 *     spawn: array{x: int, y: int},
 *     zones: list<array<string, mixed>>,
 *     portals: list<array<string, mixed>>,
 *     props?: list<array{id: string, type: string, x: int, y: int, dir?: string, settings?: array<string, string>}>,
 *     doors?: list<array{id: string, x: int, y: int, lock: string|null}>,
 * } $map
 */
class Room extends Model
{
    protected $fillable = ['slug', 'name', 'map'];

    protected function casts(): array
    {
        return [
            'map' => 'array',
        ];
    }

    /**
     * @return HasMany<Message, $this>
     */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }
}
