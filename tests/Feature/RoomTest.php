<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class RoomTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
        $this->seed(RoomSeeder::class);
    }

    public function test_guests_are_redirected(): void
    {
        $this->get('/rooms')->assertRedirect('/login');
        $this->get('/rooms/office')->assertRedirect('/login');
    }

    public function test_lobby_lists_rooms(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/rooms')->assertInertia(
            fn (Assert $page) => $page
                ->component('rooms/index')
                ->has('rooms', 2)
                ->where('rooms.0.slug', 'office')
                ->where('rooms.1.slug', 'coworking'),
        );
    }

    public function test_room_page_provides_map_history_and_position(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/rooms/office')->assertInertia(
            fn (Assert $page) => $page
                ->component('rooms/show')
                ->where('room.slug', 'office')
                ->has('room.map.rows')
                ->has('room.map.objects')
                ->has('room.map.portals')
                ->has('history')
                ->where('lastPosition', null),
        );
    }

    public function test_unknown_room_returns_404(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/rooms/basement')->assertNotFound();
    }

    public function test_seeded_maps_are_valid(): void
    {
        foreach (\App\Models\Room::all() as $room) {
            $map = $room->map;
            $width = strlen($map['rows'][0]);

            foreach ($map['rows'] as $row) {
                $this->assertSame($width, strlen($row), "{$room->slug}: строки одинаковой ширины");
            }

            // список проходимых тайлов должен совпадать с WALKABLE в
            // MapUpdateRequest и map.ts — включая spotlight '*'
            $spawnTile = $map['rows'][$map['spawn']['y']][$map['spawn']['x']];
            $this->assertContains($spawnTile, ['.', ':', ',', ';', '*'], "{$room->slug}: спавн проходим");
        }
    }
}
