<?php

namespace App\Http\Controllers;

use App\Events\DoorChanged;
use App\Models\DoorState;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DoorController extends Controller
{
    /** Смещение до клетки, с которой видно замок. */
    private const LOCK_SIDE_STEP = [
        'north' => [0, -1],
        'south' => [0, 1],
        'west' => [-1, 0],
        'east' => [1, 0],
    ];

    public function update(Request $request, Room $room): JsonResponse
    {
        $request->validate([
            'id' => ['required', 'string', 'max:64'],
            'action' => ['required', 'string', 'in:open,close,lock,unlock'],
            // позиция игрока: до двери нужно дотянуться, а замок ещё и с нужной стороны
            'x' => ['required', 'integer', 'min:0'],
            'y' => ['required', 'integer', 'min:0'],
        ]);

        // правила заданы выше, а типы берём аксессорами: validate() отдаёт
        // массив неизвестных значений, и каждое обращение к полю было бы mixed
        $action = $request->string('action')->toString();
        $x = $request->integer('x');
        $y = $request->integer('y');

        $door = $this->findDoor($room, $request->string('id')->toString());
        if ($door === null) {
            throw ValidationException::withMessages(['id' => 'В этой комнате нет такой двери']);
        }

        // дотянуться можно только с соседней клетки — иначе двери дёргали бы через всю карту
        if (abs($door['x'] - $x) + abs($door['y'] - $y) !== 1) {
            throw ValidationException::withMessages(['id' => 'До двери нужно подойти']);
        }

        $state = DoorState::firstOrNew(['room_id' => $room->id, 'door_key' => $door['id']]);
        $closed = (bool) ($state->closed ?? false);
        $locked = (bool) ($state->locked ?? false);

        switch ($action) {
            case 'open':
                if ($locked) {
                    throw ValidationException::withMessages(['id' => 'Заперто']);
                }
                $closed = false;
                break;

            case 'close':
                $closed = true;
                break;

            case 'lock':
            case 'unlock':
                $this->assertAtLock($door, $x, $y);
                $locked = $action === 'lock';
                // запирают закрытую дверь: иначе получилась бы запертая нараспашку
                $closed = $locked ? true : $closed;
                break;
        }

        // upsert, а не save(): два одновременных первых касания одной двери
        // дали бы два INSERT и падение на unique(room_id, door_key)
        DoorState::upsert(
            [['room_id' => $room->id, 'door_key' => $door['id'], 'closed' => $closed, 'locked' => $locked]],
            ['room_id', 'door_key'],
            ['closed', 'locked'],
        );

        broadcast(new DoorChanged($room, $door['id'], $closed, $locked));

        return response()->json(['id' => $door['id'], 'closed' => $closed, 'locked' => $locked]);
    }

    /**
     * Дверь из карты комнаты по её id.
     *
     * @return array{id: string, x: int, y: int, lock: string|null}|null
     */
    private function findDoor(Room $room, string $id): ?array
    {
        foreach ($room->map['doors'] ?? [] as $door) {
            if ($door['id'] === $id) {
                return $door;
            }
        }

        return null;
    }

    /**
     * @param  array{id: string, x: int, y: int, lock: string|null}  $door
     */
    private function assertAtLock(array $door, int $x, int $y): void
    {
        $side = $door['lock'];
        if ($side === null || ! isset(self::LOCK_SIDE_STEP[$side])) {
            throw ValidationException::withMessages(['id' => 'У этой двери нет замка']);
        }

        [$dx, $dy] = self::LOCK_SIDE_STEP[$side];
        if ($x !== $door['x'] + $dx || $y !== $door['y'] + $dy) {
            throw ValidationException::withMessages(['id' => 'Замок с другой стороны двери']);
        }
    }
}
