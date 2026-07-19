<?php

use App\Models\Room;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function (User $user, string $id) {
    return $user->id === (int) $id;
});

Broadcast::channel('room.{roomId}', function (User $user, string $roomId) {
    if (! Room::whereKey($roomId)->exists()) {
        return false;
    }

    return ['id' => $user->id, 'name' => $user->name, 'avatar' => $user->avatar];
});
