<?php

namespace App\Http\Controllers;

use App\Http\Requests\MapUpdateRequest;
use App\Models\DoorState;
use App\Models\Message;
use App\Models\PropCategory;
use App\Models\PropState;
use App\Models\PropType;
use App\Models\Room;
use App\Support\CurrentUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('rooms/index', [
            'rooms' => Room::query()->orderBy('id')->get(['id', 'slug', 'name']),
        ]);
    }

    public function show(Request $request, Room $room): Response
    {
        $user = CurrentUser::of($request);

        $history = Message::query()
            ->where('room_id', $room->id)
            ->with('user:id,name')
            ->latest('id')
            ->take(50)
            ->get()
            ->reverse()
            ->values()
            ->map(fn (Message $m) => [
                'id' => $m->id,
                'userId' => $m->user_id,
                'name' => $m->authorName(),
                'body' => $m->body,
                'at' => $m->sentAt(),
            ]);

        return Inertia::render('rooms/show', [
            'room' => $room->only(['id', 'slug', 'name', 'map']),
            'history' => $history,
            // сохранённая позиция актуальна только внутри той же комнаты
            'lastPosition' => $user->last_room_id === $room->id && $user->last_x !== null && $user->last_y !== null
                ? ['x' => $user->last_x, 'y' => $user->last_y]
                : null,
            'canEdit' => (bool) $user->is_admin,
            // размеры предметов живут в каталоге, в карте — только тип и позиция
            'propTypes' => PropType::catalogue(),
            // открыта дверь или заперта — состояние игры, оно вне карты
            'doorStates' => DoorState::forRoom($room),
            // переключённые предметы (телевизор вкл/выкл) — тоже состояние игры;
            // предмет без записи показывается в состоянии по умолчанию
            'propStates' => PropState::forRoom($room),
        ]);
    }

    public function edit(Request $request, Room $room): Response
    {
        abort_unless((bool) CurrentUser::of($request)->is_admin, 403);

        // категории — только для группировки карточек каталога (две оси); id не
        // нужен, каталог группирует по slug из PropType::catalogue()
        $categories = [];
        foreach (PropCategory::query()->orderBy('axis')->orderBy('sort')->orderBy('slug')->get() as $category) {
            $categories[] = ['axis' => $category->axis, 'slug' => $category->slug, 'label' => $category->label];
        }

        return Inertia::render('rooms/edit', [
            'room' => $room->only(['id', 'slug', 'name', 'map']),
            'rooms' => Room::query()->orderBy('id')->get(['slug', 'name']),
            'propTypes' => PropType::catalogue(),
            'propCategories' => $categories,
        ]);
    }

    public function update(MapUpdateRequest $request, Room $room): RedirectResponse
    {
        $room->update([
            'name' => $request->input('name'),
            'map' => $request->input('map'),
        ]);

        $this->forgetOrphanStates($room);

        return redirect()->route('rooms.show', $room);
    }

    /**
     * Убирает состояния дверей и предметов, которых в карте больше нет.
     * Иначе состояние живёт вечно: дверь удалили, поставили новую — и та
     * рождалась бы запертой, унаследовав чужую строку.
     */
    private function forgetOrphanStates(Room $room): void
    {
        $doorKeys = [];
        foreach ($room->map['doors'] ?? [] as $door) {
            $doorKeys[] = $door['id'];
        }
        DoorState::query()->where('room_id', $room->id)->whereNotIn('door_key', $doorKeys)->delete();

        $propKeys = [];
        foreach ($room->map['props'] ?? [] as $prop) {
            $propKeys[] = $prop['id'];
        }
        PropState::query()->where('room_id', $room->id)->whereNotIn('prop_key', $propKeys)->delete();
    }
}
