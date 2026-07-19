<?php

namespace App\Http\Controllers;

use App\Support\CurrentUser;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PositionController extends Controller
{
    public function update(Request $request): Response
    {
        $request->validate([
            'x' => ['required', 'integer', 'min:0', 'max:255'],
            'y' => ['required', 'integer', 'min:0', 'max:255'],
            'room_id' => ['required', 'integer', 'exists:rooms,id'],
        ]);

        CurrentUser::of($request)->forceFill([
            'last_x' => $request->integer('x'),
            'last_y' => $request->integer('y'),
            'last_room_id' => $request->integer('room_id'),
        ])->save();

        return response()->noContent();
    }
}
