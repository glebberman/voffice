<?php

namespace App\Http\Controllers;

use App\Http\Requests\PropCategoryRequest;
use App\Models\PropCategory;
use App\Support\CurrentUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * CRUD категорий каталога. Живёт на странице /props: сами категории — просто
 * ярлыки для группировок, поэтому удаление не блокируется использованием, а
 * молча отвязывает предметы (cascade на пивоте).
 */
class PropCategoryController extends Controller
{
    public function store(PropCategoryRequest $request): RedirectResponse
    {
        PropCategory::create($request->fields());

        return redirect()->route('props.index');
    }

    public function update(PropCategoryRequest $request, PropCategory $propCategory): RedirectResponse
    {
        $propCategory->update($request->fields());

        return redirect()->route('props.index');
    }

    public function destroy(Request $request, PropCategory $propCategory): RedirectResponse
    {
        abort_unless((bool) CurrentUser::of($request)->is_admin, 403);

        $propCategory->delete();

        return redirect()->route('props.index');
    }
}
