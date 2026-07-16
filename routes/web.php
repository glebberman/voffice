<?php

use App\Http\Controllers\MessageController;
use App\Http\Controllers\PositionController;
use App\Models\Message;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');

    Route::get('office', function () {
        $user = request()->user();

        $history = Message::query()
            ->where('room_id', 1)
            ->with('user:id,name')
            ->latest('id')
            ->take(50)
            ->get()
            ->reverse()
            ->values()
            ->map(fn (Message $m) => [
                'id' => $m->id,
                'userId' => $m->user_id,
                'name' => $m->user->name,
                'body' => $m->body,
                'at' => $m->created_at->toIso8601String(),
            ]);

        return Inertia::render('office', [
            'history' => $history,
            'lastPosition' => $user->last_x !== null && $user->last_y !== null
                ? ['x' => $user->last_x, 'y' => $user->last_y]
                : null,
        ]);
    })->name('office');

    Route::post('messages', [MessageController::class, 'store'])->name('messages.store');
    Route::post('position', [PositionController::class, 'update'])->name('position.update');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
