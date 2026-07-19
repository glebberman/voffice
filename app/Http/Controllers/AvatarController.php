<?php

namespace App\Http\Controllers;

use App\Support\CurrentUser;
use App\Support\Wardrobe;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AvatarController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        // гардероб — единый источник правды для клиента и валидации
        $wardrobe = Wardrobe::all();

        $body = $request->input('body');
        $bodyConfig = is_string($body) ? ($wardrobe['bodies'][$body] ?? null) : null;

        $request->validate([
            'body' => ['required', 'string', Rule::in(array_keys($wardrobe['bodies']))],
            'hair' => ['required', 'string', Rule::in($wardrobe['hairs'])],
            'top' => ['required', 'string', Rule::in(array_keys($bodyConfig['tops'] ?? []))],
            'legs' => ['required', 'string', Rule::in(array_keys($bodyConfig['legs'] ?? []))],
            'tie' => ['boolean'],
        ]);

        $avatar = [
            'body' => $request->string('body')->toString(),
            'hair' => $request->string('hair')->toString(),
            'top' => $request->string('top')->toString(),
            'legs' => $request->string('legs')->toString(),
            'tie' => $request->boolean('tie'),
        ];

        CurrentUser::of($request)->forceFill(['avatar' => $avatar])->save();

        return response()->json($avatar);
    }
}
