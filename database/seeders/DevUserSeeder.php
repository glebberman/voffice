<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Hash;

class DevUserSeeder extends Seeder
{
    /**
     * Тестовые аккаунты из docs/tutorials/01-pervyy-zapusk.md.
     *
     * Раньше они жили только в dev-базе и исчезали после `migrate:fresh`, а
     * восстанавливать их предлагалось руками через экран регистрации — причём
     * админский флаг всё равно приходилось выставлять отдельно.
     */
    private const USERS = [
        ['name' => 'Аня', 'email' => 'anya@voffice.test', 'is_admin' => true],
        ['name' => 'Боря', 'email' => 'borya@voffice.test', 'is_admin' => false],
    ];

    public function run(): void
    {
        // Пароль у них общеизвестный, так что вне локальной разработки таких
        // аккаунтов быть не должно — там сидер молча ничего не делает.
        if (! App::environment('local', 'testing')) {
            return;
        }

        foreach (self::USERS as $data) {
            $user = User::firstOrNew(['email' => $data['email']]);
            $user->name = $data['name'];
            $user->is_admin = $data['is_admin']; // не в $fillable — только присваиванием
            $user->email_verified_at ??= now();
            $user->password ??= Hash::make('password');
            $user->save();
        }
    }
}
