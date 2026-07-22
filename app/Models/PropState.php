<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Состояние поставленного предмета в комнате (телевизор включён / выключен).
 * Предметы без строки показываются в состоянии по умолчанию из каталога, так
 * что запись создаётся только когда предмет впервые переключили — как у дверей.
 */
class PropState extends Model
{
    protected $fillable = ['room_id', 'prop_key', 'state'];

    /**
     * @return BelongsTo<Room, $this>
     */
    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /**
     * Состояния всех переключённых предметов комнаты: id предмета → состояние.
     *
     * @return array<string, string>
     */
    public static function forRoom(Room $room): array
    {
        $states = [];
        foreach (self::query()->where('room_id', $room->id)->get() as $state) {
            $states[$state->prop_key] = $state->state;
        }

        return $states;
    }
}
