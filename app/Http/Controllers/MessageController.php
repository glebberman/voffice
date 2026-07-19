<?php

namespace App\Http\Controllers;

use App\Events\MessageSent;
use App\Support\CurrentUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:500'],
            'room_id' => ['required', 'integer', 'exists:rooms,id'],
        ]);

        $message = CurrentUser::of($request)->messages()->create([
            'room_id' => $validated['room_id'],
            'body' => $validated['body'],
        ]);

        broadcast(new MessageSent($message))->toOthers();

        return response()->json([
            'id' => $message->id,
            'userId' => $message->user_id,
            'name' => CurrentUser::of($request)->name,
            'body' => $message->body,
            'at' => $message->sentAt(),
        ], 201);
    }
}
