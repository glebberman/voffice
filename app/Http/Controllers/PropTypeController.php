<?php

namespace App\Http\Controllers;

use App\Http\Requests\PropTypeRequest;
use App\Models\PropType;
use App\Models\Room;
use App\Support\CurrentUser;
use App\Support\SpriteSheets;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class PropTypeController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless((bool) CurrentUser::of($request)->is_admin, 403);

        $types = [];
        foreach (PropType::query()->with('orientations')->orderBy('id')->get() as $type) {
            $orientations = [];
            foreach ($type->sortedOrientations() as $orientation) {
                $orientations[] = [
                    'dir' => $orientation->dir,
                    'sheet' => $orientation->sheet,
                    'sx' => $orientation->sx,
                    'sy' => $orientation->sy,
                    'w' => $orientation->w,
                    'h' => $orientation->h,
                    'tall' => $orientation->tall,
                ];
            }
            $types[] = [
                'id' => $type->id,
                'slug' => $type->slug,
                'label' => $type->label,
                'orientations' => $orientations,
            ];
        }

        return Inertia::render('props/index', [
            'types' => $types,
            'sheets' => SpriteSheets::all(),
            // сколько раз каждый тип уже стоит на картах: удалять использованные нельзя
            'usage' => $this->usage(),
        ]);
    }

    public function store(PropTypeRequest $request): RedirectResponse
    {
        DB::transaction(function () use ($request): void {
            $this->syncOrientations(PropType::create($request->typeFields()), $request);
        });

        return redirect()->route('props.index');
    }

    public function update(PropTypeRequest $request, PropType $propType): RedirectResponse
    {
        DB::transaction(function () use ($request, $propType): void {
            $propType->update($request->typeFields());
            $this->syncOrientations($propType, $request);
        });

        return redirect()->route('props.index');
    }

    /**
     * Ориентации приходят полным набором: пришедшие обновляем, остальные
     * удаляем — так вкладки редактора и БД не разъезжаются.
     */
    private function syncOrientations(PropType $type, PropTypeRequest $request): void
    {
        $dirs = [];
        foreach ($request->orientationFields() as $fields) {
            $dirs[] = $fields['dir'];
            $type->orientations()->updateOrCreate(['dir' => $fields['dir']], $fields);
        }
        $type->orientations()->whereNotIn('dir', $dirs)->delete();
    }

    public function destroy(Request $request, PropType $propType): RedirectResponse
    {
        abort_unless((bool) CurrentUser::of($request)->is_admin, 403);

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
