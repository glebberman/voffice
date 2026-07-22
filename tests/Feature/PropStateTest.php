<?php

namespace Tests\Feature;

use App\Events\PropChanged;
use App\Models\Room;
use App\Models\User;
use Database\Seeders\PropTypeSeeder;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Переключение состояния предмета — калька с дверей: решает сервер, состояние
 * живёт вне карты (prop_states), об изменении узнают все в комнате.
 *
 * Витрина в демо-офисе: телевизор `tv-17` на (8,33) — тип switchable с
 * состояниями off/no-signal/on и зоной перед экраном (8..10, 34).
 */
class PropStateTest extends TestCase
{
    use RefreshDatabase;

    private Room $office;

    protected function setUp(): void
    {
        parent::setUp();

        // ShouldBroadcastNow публикует прямо из запроса, а Reverb в тестах нет
        Event::fake([PropChanged::class]);

        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
        $this->seed(PropTypeSeeder::class);
        $this->seed(RoomSeeder::class);
        $this->office = Room::where('slug', 'office')->firstOrFail();
    }

    public function test_switchable_prop_toggles_and_reaches_everyone(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/rooms/office/prop-states', ['id' => 'tv-17', 'state' => 'on', 'x' => 9, 'y' => 34])
            ->assertOk()
            ->assertJson(['id' => 'tv-17', 'state' => 'on']);

        $this->assertDatabaseHas('prop_states', ['room_id' => $this->office->id, 'prop_key' => 'tv-17', 'state' => 'on']);
        Event::assertDispatched(
            PropChanged::class,
            fn (PropChanged $e): bool => $e->propId === 'tv-17' && $e->state === 'on' && $e->room->is($this->office),
        );

        // снапшот уезжает на страницу комнаты: предмет без записи рисуется дефолтом
        $this->actingAs($user)->get('/rooms/office')
            ->assertInertia(fn (Assert $p) => $p->component('rooms/show')->where('propStates.tv-17', 'on'));

        // повторное переключение обновляет ту же строку, а не плодит новые
        $this->actingAs($user)
            ->postJson('/rooms/office/prop-states', ['id' => 'tv-17', 'state' => 'off', 'x' => 9, 'y' => 34])
            ->assertOk();
        $this->assertDatabaseCount('prop_states', 1);
    }

    public function test_switching_is_refused_when_it_should_not_work(): void
    {
        $user = User::factory()->create();

        // стоя в стороне — до предмета нужно дойти
        $this->actingAs($user)
            ->postJson('/rooms/office/prop-states', ['id' => 'tv-17', 'state' => 'on', 'x' => 1, 'y' => 1])
            ->assertStatus(422);

        // такого состояния у типа нет
        $this->actingAs($user)
            ->postJson('/rooms/office/prop-states', ['id' => 'tv-17', 'state' => 'нет-такого', 'x' => 9, 'y' => 34])
            ->assertStatus(422);

        // ноутбук — embed, а не switchable: переключать нечего
        $this->actingAs($user)
            ->postJson('/rooms/office/prop-states', ['id' => 'laptop-1', 'state' => 'on', 'x' => 7, 'y' => 9])
            ->assertStatus(422);

        // предмета нет в этой комнате
        $this->actingAs($user)
            ->postJson('/rooms/office/prop-states', ['id' => 'нет-такого', 'state' => 'on', 'x' => 9, 'y' => 34])
            ->assertStatus(422);

        $this->assertDatabaseCount('prop_states', 0);
        Event::assertNotDispatched(PropChanged::class);
    }

    public function test_guests_cannot_switch_props(): void
    {
        $this->postJson('/rooms/office/prop-states', ['id' => 'tv-17', 'state' => 'on', 'x' => 9, 'y' => 34])
            ->assertUnauthorized();

        $this->assertDatabaseCount('prop_states', 0);
    }
}
