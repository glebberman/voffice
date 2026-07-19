<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DevUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DevUserSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_documented_test_accounts(): void
    {
        $this->seed(DevUserSeeder::class);

        $anya = User::where('email', 'anya@voffice.test')->firstOrFail();
        $borya = User::where('email', 'borya@voffice.test')->firstOrFail();

        $this->assertTrue($anya->is_admin, 'Аня — админ, иначе редактор карт недоступен');
        $this->assertFalse($borya->is_admin);
        $this->assertTrue(Hash::check('password', $anya->password));
    }

    public function test_running_twice_does_not_duplicate_users(): void
    {
        $this->seed(DevUserSeeder::class);
        $this->seed(DevUserSeeder::class);

        $this->assertSame(1, User::where('email', 'anya@voffice.test')->count());
    }

    public function test_does_not_reset_a_changed_password(): void
    {
        $this->seed(DevUserSeeder::class);

        $anya = User::where('email', 'anya@voffice.test')->firstOrFail();
        $anya->password = Hash::make('свой-пароль');
        $anya->save();

        $this->seed(DevUserSeeder::class);

        $this->assertTrue(Hash::check('свой-пароль', $anya->refresh()->password));
    }

    public function test_skipped_outside_local(): void
    {
        // Общеизвестный пароль не должен попасть за пределы разработки.
        // Сидер зовём напрямую: через `db:seed` тест упёрся бы в вопрос
        // «точно запускать в production?», а не в саму проверку окружения.
        $this->app->detectEnvironment(fn () => 'production');

        (new DevUserSeeder)->run();

        $this->assertSame(0, User::count());
    }
}
