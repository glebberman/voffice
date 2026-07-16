<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PositionController extends Controller
{
    public function update(Request $request): Response
    {
        $validated = $request->validate([
            'x' => ['required', 'integer', 'min:0', 'max:255'],
            'y' => ['required', 'integer', 'min:0', 'max:255'],
        ]);

        $request->user()->forceFill([
            'last_x' => $validated['x'],
            'last_y' => $validated['y'],
        ])->save();

        return response()->noContent();
    }
}
