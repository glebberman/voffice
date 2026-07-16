<?php

namespace App\Http\Controllers;

use App\Models\Message;
use App\Models\Room;
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
        $user = $request->user();

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
                'name' => $m->user->name,
                'body' => $m->body,
                'at' => $m->created_at->toIso8601String(),
            ]);

        return Inertia::render('rooms/show', [
            'room' => $room->only(['id', 'slug', 'name', 'map']),
            'history' => $history,
            // сохранённая позиция актуальна только внутри той же комнаты
            'lastPosition' => $user->last_room_id === $room->id && $user->last_x !== null && $user->last_y !== null
                ? ['x' => $user->last_x, 'y' => $user->last_y]
                : null,
        ]);
    }
}
