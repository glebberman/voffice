<?php

namespace App\Http\Controllers;

use App\Support\CurrentUser;
use App\Support\MapLimits;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PositionController extends Controller
{
    public function update(Request $request): Response
    {
        // Предел — сторона самой большой допустимой карты, а не «сколько
        // влезает в байт»: на карте шире 256 дальний край иначе отвечал 422, и
        // позиция там просто не сохранялась.
        $request->validate([
            'x' => ['required', 'integer', 'min:0', 'max:'.MapLimits::MAX_COORD],
            'y' => ['required', 'integer', 'min:0', 'max:'.MapLimits::MAX_COORD],
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
