<?php

namespace App\Http\Controllers;

use App\Events\MessageSent;
use App\Models\Message;
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

        $message = $request->user()->messages()->create([
            'room_id' => $validated['room_id'],
            'body' => $validated['body'],
        ]);

        broadcast(new MessageSent($message))->toOthers();

        return response()->json([
            'id' => $message->id,
            'userId' => $message->user_id,
            'name' => $request->user()->name,
            'body' => $message->body,
            'at' => $message->created_at->toIso8601String(),
        ], 201);
    }
}
