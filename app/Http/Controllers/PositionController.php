<?php

namespace App\Http\Controllers;

use App\Support\CurrentUser;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PositionController extends Controller
{
    public function update(Request $request): Response
    {
        $validated = $request->validate([
            'x' => ['required', 'integer', 'min:0', 'max:255'],
            'y' => ['required', 'integer', 'min:0', 'max:255'],
            'room_id' => ['required', 'integer', 'exists:rooms,id'],
        ]);

        CurrentUser::of($request)->forceFill([
            'last_x' => $validated['x'],
            'last_y' => $validated['y'],
            'last_room_id' => $validated['room_id'],
        ])->save();

        return response()->noContent();
    }
}
