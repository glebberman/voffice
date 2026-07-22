<?php

namespace App\Http\Controllers;

use App\Events\PropChanged;
use App\Models\PropState;
use App\Models\PropType;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Переключение состояния поставленного предмета (телевизор вкл/выкл) — калька с
 * дверей: решение принимает сервер, потому что только он знает каталог; клиент
 * лишь называет предмет, желаемое состояние и говорит, откуда тянется.
 */
class PropStateController extends Controller
{
    public function update(Request $request, Room $room): JsonResponse
    {
        $request->validate([
            'id' => ['required', 'string', 'max:64'],
            'state' => ['required', 'string', 'max:64'],
            // позиция игрока: переключать можно только стоя в зоне взаимодействия
            'x' => ['required', 'integer', 'min:0'],
            'y' => ['required', 'integer', 'min:0'],
        ]);

        $id = $request->string('id')->toString();
        $state = $request->string('state')->toString();

        $prop = $this->findProp($room, $id);
        if ($prop === null) {
            throw ValidationException::withMessages(['id' => 'В этой комнате нет такого предмета']);
        }

        $spec = PropType::catalogue()[$prop['type']] ?? null;
        if ($spec === null || $spec['behavior'] !== 'switchable') {
            throw ValidationException::withMessages(['id' => 'Этот предмет не переключается']);
        }

        $orientation = PropType::orientationOf($spec, $prop['dir'] ?? null);
        if ($orientation === null) {
            throw ValidationException::withMessages(['id' => 'У предмета нет ни одной ориентации']);
        }
        if (! isset($orientation['states'][$state])) {
            throw ValidationException::withMessages(['state' => 'У предмета нет такого состояния']);
        }
        if (! self::inZone($orientation['interaction'], $prop, $request->integer('x'), $request->integer('y'))) {
            throw ValidationException::withMessages(['id' => 'К предмету нужно подойти']);
        }

        // upsert, а не updateOrCreate: два одновременных первых переключения
        // одного предмета дали бы два INSERT и падение на unique(room_id, prop_key)
        PropState::upsert([['room_id' => $room->id, 'prop_key' => $id, 'state' => $state]], ['room_id', 'prop_key'], ['state']);

        broadcast(new PropChanged($room, $id, $state));

        return response()->json(['id' => $id, 'state' => $state]);
    }

    /**
     * Предмет из карты комнаты по его id.
     *
     * @return array{id: string, type: string, x: int, y: int, dir?: string, settings?: array<string, string>}|null
     */
    private function findProp(Room $room, string $id): ?array
    {
        foreach ($room->map['props'] ?? [] as $prop) {
            if ($prop['id'] === $id) {
                return $prop;
            }
        }

        return null;
    }

    /**
     * Стоит ли игрок на одной из клеток зоны: смещения ориентации + origin
     * предмета (та же арифметика, что у клиента в propInteractionCells).
     *
     * @param  list<array{dx: int, dy: int}>  $cells
     * @param  array{x: int, y: int}  $prop
     */
    private static function inZone(array $cells, array $prop, int $x, int $y): bool
    {
        foreach ($cells as $cell) {
            if ($x === $prop['x'] + $cell['dx'] && $y === $prop['y'] + $cell['dy']) {
                return true;
            }
        }

        return false;
    }
}
