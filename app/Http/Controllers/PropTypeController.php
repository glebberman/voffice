<?php

namespace App\Http\Controllers;

use App\Http\Requests\PropTypeRequest;
use App\Models\PropType;
use App\Models\Room;
use App\Support\SpriteSheets;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PropTypeController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless((bool) $request->user()->is_admin, 403);

        return Inertia::render('props/index', [
            'types' => PropType::query()->orderBy('id')->get(['id', 'slug', 'label', 'sheet', 'sx', 'sy', 'w', 'h', 'tall']),
            'sheets' => SpriteSheets::all(),
            // сколько раз каждый тип уже стоит на картах: удалять использованные нельзя
            'usage' => $this->usage(),
        ]);
    }

    public function store(PropTypeRequest $request): RedirectResponse
    {
        PropType::create($request->validated());

        return redirect()->route('props.index');
    }

    public function update(PropTypeRequest $request, PropType $propType): RedirectResponse
    {
        $propType->update($request->validated());

        return redirect()->route('props.index');
    }

    public function destroy(Request $request, PropType $propType): RedirectResponse
    {
        abort_unless((bool) $request->user()->is_admin, 403);

        $used = $this->usage()[$propType->slug] ?? 0;
        if ($used > 0) {
            return back()->withErrors(['slug' => "Предмет стоит на картах ({$used} шт.) — сначала уберите его из редактора карты"]);
        }

        $propType->delete();

        return redirect()->route('props.index');
    }

    /**
     * Сколько предметов каждого типа расставлено по всем картам.
     *
     * @return array<string, int>
     */
    private function usage(): array
    {
        $counts = [];

        foreach (Room::query()->get(['map']) as $room) {
            // форму props гарантирует валидация карты (MapUpdateRequest)
            foreach ($room->map['props'] ?? [] as $prop) {
                $counts[$prop['type']] = ($counts[$prop['type']] ?? 0) + 1;
            }
        }

        return $counts;
    }
}
