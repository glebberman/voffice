<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Состояние двери в комнате. Двери без строки считаются открытыми, так что
 * запись создаётся только когда дверь впервые тронули.
 */
class DoorState extends Model
{
    protected $fillable = ['room_id', 'door_key', 'closed', 'locked'];

    protected function casts(): array
    {
        return [
            'closed' => 'boolean',
            'locked' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Room, $this>
     */
    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /**
     * Состояния всех дверей комнаты в виде, в каком их ждёт клиент.
     *
     * @return array<string, array{closed: bool, locked: bool}>
     */
    public static function forRoom(Room $room): array
    {
        $states = [];
        foreach (self::query()->where('room_id', $room->id)->get() as $state) {
            $states[$state->door_key] = ['closed' => $state->closed, 'locked' => $state->locked];
        }

        return $states;
    }
}
