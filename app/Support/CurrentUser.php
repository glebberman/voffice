<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

/**
 * Пользователь запроса — не nullable.
 *
 * `$request->user()` по сигнатуре возвращает `?User`, и на 8-м уровне анализа
 * каждое обращение к его полям становится ошибкой. Все такие маршруты стоят за
 * middleware `auth`, поэтому null там означает не «гость», а нарушенную
 * гарантию — и 401 на него честнее, чем ветка, которую никогда не выполнят.
 */
class CurrentUser
{
    public static function of(Request $request): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            abort(401);
        }

        return $user;
    }
}
