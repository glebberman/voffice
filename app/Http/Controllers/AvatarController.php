<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AvatarController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        // гардероб — единый источник правды для клиента и валидации
        $wardrobe = json_decode(file_get_contents(resource_path('wardrobe.json')), true);

        $body = $request->input('body');
        $bodyConfig = $wardrobe['bodies'][$body] ?? null;

        $validated = $request->validate([
            'body' => ['required', 'string', Rule::in(array_keys($wardrobe['bodies']))],
            'hair' => ['required', 'string', Rule::in($wardrobe['hairs'])],
            'top' => ['required', 'string', Rule::in(array_keys($bodyConfig['tops'] ?? []))],
            'legs' => ['required', 'string', Rule::in(array_keys($bodyConfig['legs'] ?? []))],
            'tie' => ['boolean'],
        ]);

        $avatar = [
            'body' => $validated['body'],
            'hair' => $validated['hair'],
            'top' => $validated['top'],
            'legs' => $validated['legs'],
            'tie' => (bool) ($validated['tie'] ?? false),
        ];

        $request->user()->forceFill(['avatar' => $avatar])->save();

        return response()->json($avatar);
    }
}
