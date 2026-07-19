<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    protected $fillable = ['room_id', 'user_id', 'body'];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Имя автора. Связь по типу nullable, хотя user_id — внешний ключ с
     * каскадным удалением: сообщения без автора в базе не бывает. Запас на
     * случай, если оно всё же попадётся, дешевле падения на null.
     *
     * `??` работает по семантике isset и сам гасит обращение к полю на null,
     * поэтому `?->` здесь был бы лишним.
     */
    public function authorName(): string
    {
        return $this->user->name ?? 'Неизвестно';
    }

    /**
     * Время отправки в ISO 8601. `timestamps()` заводит колонки nullable,
     * поэтому у модели тип created_at — `?Carbon`; у сохранённого сообщения
     * значение всегда есть.
     */
    public function sentAt(): string
    {
        return ($this->created_at ?? $this->freshTimestamp())->toIso8601String();
    }
}
