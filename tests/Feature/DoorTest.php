<?php

namespace Tests\Feature;

use App\Events\DoorChanged;
use App\Models\DoorState;
use App\Models\Room;
use App\Models\User;
use Database\Seeders\PropTypeSeeder;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class DoorTest extends TestCase
{
    use RefreshDatabase;

    private Room $room;

    protected function setUp(): void
    {
        parent::setUp();

        // ShouldBroadcastNow публикует прямо из запроса, а Reverb в тестах нет
        Event::fake([DoorChanged::class]);

        $this->seed(PropTypeSeeder::class);
        $this->seed(RoomSeeder::class);

        // маленькая карта: две комнаты и единственный проём на (3,3)
        $this->room = Room::where('slug', 'office')->firstOrFail();
        $this->room->update(['map' => [
            'rows' => ['#######', '#.....#', '#.....#', '###.###', '#.....#', '#.....#', '#######'],
            'spawn' => ['x' => 1, 'y' => 1],
            'zones' => [],
            'portals' => [],
            'doors' => [
                ['id' => 'plain', 'x' => 3, 'y' => 3, 'lock' => null],
                ['id' => 'locked-north', 'x' => 3, 'y' => 3, 'lock' => 'north'],
            ],
        ]]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return TestResponse<JsonResponse>
     */
    private function act(array $payload, ?User $user = null): TestResponse
    {
        return $this->actingAs($user ?? User::factory()->create())
            ->postJson("/rooms/{$this->room->slug}/doors", $payload);
    }

    public function test_guest_cannot_touch_doors(): void
    {
        $this->postJson("/rooms/{$this->room->slug}/doors", [
            'id' => 'plain', 'action' => 'close', 'x' => 3, 'y' => 2,
        ])->assertUnauthorized();
    }

    public function test_open_and_close_from_either_side(): void
    {
        $this->act(['id' => 'plain', 'action' => 'close', 'x' => 3, 'y' => 2])
            ->assertOk()
            ->assertJson(['id' => 'plain', 'closed' => true, 'locked' => false]);

        $this->assertDatabaseHas('door_states', ['door_key' => 'plain', 'closed' => true]);

        // с другой стороны открывается так же
        $this->act(['id' => 'plain', 'action' => 'open', 'x' => 3, 'y' => 4])
            ->assertOk()
            ->assertJson(['closed' => false]);
    }

    public function test_door_must_be_within_reach(): void
    {
        $this->act(['id' => 'plain', 'action' => 'close', 'x' => 1, 'y' => 1])
            ->assertJsonValidationErrors('id');

        // по диагонали тоже не дотянуться
        $this->act(['id' => 'plain', 'action' => 'close', 'x' => 2, 'y' => 2])
            ->assertJsonValidationErrors('id');

        $this->assertDatabaseCount('door_states', 0);
    }

    public function test_unknown_door_is_rejected(): void
    {
        $this->act(['id' => 'нет-такой', 'action' => 'close', 'x' => 3, 'y' => 2])
            ->assertJsonValidationErrors('id');
    }

    public function test_lock_only_from_the_side_with_the_lock(): void
    {
        // замок сверху: снизу не запереть
        $this->act(['id' => 'locked-north', 'action' => 'lock', 'x' => 3, 'y' => 4])
            ->assertJsonValidationErrors('id');

        $this->act(['id' => 'locked-north', 'action' => 'lock', 'x' => 3, 'y' => 2])
            ->assertOk()
            ->assertJson(['closed' => true, 'locked' => true]);
    }

    public function test_door_without_lock_cannot_be_locked(): void
    {
        $this->act(['id' => 'plain', 'action' => 'lock', 'x' => 3, 'y' => 2])
            ->assertJsonValidationErrors('id');
    }

    public function test_locked_door_does_not_open_from_any_side(): void
    {
        $this->act(['id' => 'locked-north', 'action' => 'lock', 'x' => 3, 'y' => 2])->assertOk();

        // ключ с одной стороны: пока не отопрут, не открыть ни снаружи, ни изнутри
        $this->act(['id' => 'locked-north', 'action' => 'open', 'x' => 3, 'y' => 4])
            ->assertJsonValidationErrors('id');
        $this->act(['id' => 'locked-north', 'action' => 'open', 'x' => 3, 'y' => 2])
            ->assertJsonValidationErrors('id');

        // отпереть можно только со стороны замка
        $this->act(['id' => 'locked-north', 'action' => 'unlock', 'x' => 3, 'y' => 4])
            ->assertJsonValidationErrors('id');
        $this->act(['id' => 'locked-north', 'action' => 'unlock', 'x' => 3, 'y' => 2])
            ->assertOk()
            ->assertJson(['locked' => false]);

        $this->act(['id' => 'locked-north', 'action' => 'open', 'x' => 3, 'y' => 4])->assertOk();
    }

    public function test_change_is_broadcast_to_the_room(): void
    {
        $this->act(['id' => 'plain', 'action' => 'close', 'x' => 3, 'y' => 2])->assertOk();

        Event::assertDispatched(
            DoorChanged::class,
            fn (DoorChanged $e) => $e->doorId === 'plain' && $e->closed && $e->room->is($this->room),
        );
    }

    public function test_room_page_exposes_current_states(): void
    {
        $this->act(['id' => 'plain', 'action' => 'close', 'x' => 3, 'y' => 2])->assertOk();

        $states = DoorState::forRoom($this->room->refresh());

        $this->assertSame(['closed' => true, 'locked' => false], $states['plain']);
        // нетронутая дверь строки не заводит — она просто открыта
        $this->assertArrayNotHasKey('locked-north', $states);
    }

    public function test_reverb_address_reaches_serve_workers(): void
    {
        // `artisan serve` пропускает в рабочие процессы только переменные из
        // белого списка, остальные они перечитывают из .env. Без этого веб-
        // запрос публиковал события на localhost вместо контейнера reverb и
        // падал с 500 — а CLI в том же контейнере работал, и баг долго прятался.
        foreach (['REVERB_HOST', 'REVERB_PORT', 'REVERB_SCHEME'] as $variable) {
            $this->assertContains($variable, ServeCommand::$passthroughVariables, $variable);
        }
    }

    public function test_map_rejects_door_on_a_wall(): void
    {
        $admin = User::factory()->admin()->create();
        $map = $this->room->map;
        $map['doors'] = [['id' => 'bad', 'x' => 0, 'y' => 0, 'lock' => null]];

        $this->actingAs($admin)
            ->put("/rooms/{$this->room->slug}", ['name' => 'Офис', 'map' => $map])
            ->assertSessionHasErrors('map.doors.0');
    }

    public function test_map_rejects_two_doors_on_one_tile(): void
    {
        $admin = User::factory()->admin()->create();
        $map = $this->room->map;
        $map['doors'] = [
            ['id' => 'a', 'x' => 3, 'y' => 3, 'lock' => null],
            ['id' => 'b', 'x' => 3, 'y' => 3, 'lock' => 'north'],
        ];

        $this->actingAs($admin)
            ->put("/rooms/{$this->room->slug}", ['name' => 'Офис', 'map' => $map])
            ->assertSessionHasErrors('map.doors.1');
    }

    public function test_map_rejects_unknown_lock_side(): void
    {
        $admin = User::factory()->admin()->create();
        $map = $this->room->map;
        $map['doors'] = [['id' => 'a', 'x' => 3, 'y' => 3, 'lock' => 'вверх']];

        $this->actingAs($admin)
            ->put("/rooms/{$this->room->slug}", ['name' => 'Офис', 'map' => $map])
            ->assertSessionHasErrors('map.doors.0.lock');
    }
}
