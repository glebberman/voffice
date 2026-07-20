<?php

use App\Http\Controllers\AvatarController;
use App\Http\Controllers\DoorController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\PositionController;
use App\Http\Controllers\PropCategoryController;
use App\Http\Controllers\PropTypeController;
use App\Http\Controllers\RoomController;
use App\Models\Room;
use App\Support\CurrentUser;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function (): void {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');

    // привычная ссылка: ведёт в последнюю комнату пользователя
    Route::get('office', function () {
        $room = Room::find(CurrentUser::of(request())->last_room_id) ?? Room::where('slug', 'office')->firstOrFail();

        return redirect()->route('rooms.show', $room);
    })->name('office');

    Route::get('rooms', [RoomController::class, 'index'])->name('rooms.index');
    Route::get('rooms/{room:slug}', [RoomController::class, 'show'])->name('rooms.show');
    Route::get('rooms/{room:slug}/edit', [RoomController::class, 'edit'])->name('rooms.edit');
    Route::put('rooms/{room:slug}', [RoomController::class, 'update'])->name('rooms.update');

    // каталог предметов обстановки (только админам — проверка в контроллере)
    Route::get('props', [PropTypeController::class, 'index'])->name('props.index');
    Route::post('props', [PropTypeController::class, 'store'])->name('props.store');
    Route::put('props/{prop_type}', [PropTypeController::class, 'update'])->name('props.update');
    Route::delete('props/{prop_type}', [PropTypeController::class, 'destroy'])->name('props.destroy');

    // категории каталога (две оси группировки, правятся там же, на /props)
    Route::post('prop-categories', [PropCategoryController::class, 'store'])->name('prop-categories.store');
    Route::put('prop-categories/{prop_category}', [PropCategoryController::class, 'update'])->name('prop-categories.update');
    Route::delete('prop-categories/{prop_category}', [PropCategoryController::class, 'destroy'])->name('prop-categories.destroy');

    Route::post('rooms/{room:slug}/doors', [DoorController::class, 'update'])->name('doors.update');

    Route::post('messages', [MessageController::class, 'store'])->name('messages.store');
    Route::post('position', [PositionController::class, 'update'])->name('position.update');
    Route::post('avatar', [AvatarController::class, 'update'])->name('avatar.update');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
