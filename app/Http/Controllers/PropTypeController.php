<?php

namespace App\Http\Controllers;

use App\Http\Requests\PropTypeRequest;
use App\Models\PropCategory;
use App\Models\PropType;
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

        $categories = [];
        foreach (PropCategory::query()->orderBy('axis')->orderBy('sort')->orderBy('slug')->get() as $category) {
            $categories[] = [
                'id' => $category->id,
                'axis' => $category->axis,
                'slug' => $category->slug,
                'label' => $category->label,
            ];
        }

        $types = [];
        foreach (PropType::query()->with(['orientations', 'categories'])->orderBy('id')->get() as $type) {
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
                    'states' => $orientation->stateRegions(),
                    'interaction' => $orientation->interactionCells(),
                ];
            }
            $types[] = [
                'id' => $type->id,
                'slug' => $type->slug,
                'label' => $type->label,
                'description' => $type->description,
                'defaultState' => $type->default_state,
                'behavior' => $type->behavior,
                'categoryIds' => $type->categories->map(fn (PropCategory $c): int => $c->id)->all(),
                'orientations' => $orientations,
            ];
        }

        return Inertia::render('props/index', [
            'types' => $types,
            'categories' => $categories,
            'sheets' => SpriteSheets::all(),
            // сколько раз каждый тип уже стоит на картах: удалять использованные нельзя
            'usage' => PropType::usage(),
        ]);
    }

    public function store(PropTypeRequest $request): RedirectResponse
    {
        DB::transaction(function () use ($request): void {
            $type = PropType::create($request->typeFields());
            $type->categories()->sync($request->categoryIds());
            $this->syncOrientations($type, $request);
        });

        return redirect()->route('props.index');
    }

    public function update(PropTypeRequest $request, PropType $propType): RedirectResponse
    {
        DB::transaction(function () use ($request, $propType): void {
            $propType->update($request->typeFields());
            $propType->categories()->sync($request->categoryIds());
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

        $used = PropType::usage()[$propType->slug] ?? 0;
        if ($used > 0) {
            return back()->withErrors(['slug' => "Предмет стоит на картах ({$used} шт.) — сначала уберите его из редактора карты"]);
        }

        $propType->delete();

        return redirect()->route('props.index');
    }
}
