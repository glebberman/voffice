<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MapEditorTest extends TestCase
{
    use RefreshDatabase;

    private Room $office;

    protected function setUp(): void
    {
        parent::setUp();

        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
        $this->seed(RoomSeeder::class);
        $this->office = Room::where('slug', 'office')->firstOrFail();
    }

    private function validMap(): array
    {
        return [
            'rows' => ['#####', '#...#', '#.*.#', '#...#', '#####'],
            'spawn' => ['x' => 2, 'y' => 2],
            'zones' => [],
            'objects' => [],
            'portals' => [],
        ];
    }

    public function test_show_exposes_can_edit_flag(): void
    {
        $this->actingAs(User::factory()->create())
            ->get('/rooms/office')
            ->assertInertia(fn (Assert $p) => $p->where('canEdit', false));

        $this->actingAs(User::factory()->admin()->create())
            ->get('/rooms/office')
            ->assertInertia(fn (Assert $p) => $p->where('canEdit', true));
    }

    public function test_non_admin_cannot_open_or_save(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/rooms/office/edit')->assertForbidden();
        $this->actingAs($user)->put('/rooms/office', ['name' => 'Взлом', 'map' => $this->validMap()])->assertForbidden();
    }

    public function test_admin_can_open_editor(): void
    {
        $this->actingAs(User::factory()->admin()->create())
            ->get('/rooms/office/edit')
            ->assertInertia(fn (Assert $p) => $p->component('rooms/edit')->where('room.slug', 'office')->has('rooms'));
    }

    public function test_admin_saves_valid_map(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->put('/rooms/office', ['name' => 'Новый офис', 'map' => $this->validMap()])
            ->assertRedirect('/rooms/office');

        $this->office->refresh();
        $this->assertSame('Новый офис', $this->office->name);
        $this->assertSame(['#####', '#...#', '#.*.#', '#...#', '#####'], $this->office->map['rows']);
    }

    public function test_map_geometry_is_validated(): void
    {
        $admin = User::factory()->admin()->create();

        // строки разной ширины
        $bad = $this->validMap();
        $bad['rows'] = ['#####', '#..#', '#####'];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $bad])->assertSessionHasErrors('map.rows');

        // спавн на стене
        $wallSpawn = $this->validMap();
        $wallSpawn['spawn'] = ['x' => 0, 'y' => 0];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $wallSpawn])->assertSessionHasErrors('map.spawn');

        // объект за границей
        $oob = $this->validMap();
        $oob['objects'] = [['id' => 'a', 'type' => 'board', 'label' => 'x', 'url' => 'https://a.b', 'x' => 99, 'y' => 99]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $oob])->assertSessionHasErrors('map.objects.0');

        // портал в несуществующую комнату
        $badPortal = $this->validMap();
        $badPortal['portals'] = [['x' => 1, 'y' => 1, 'to' => 'basement', 'label' => 'x', 'tx' => 1, 'ty' => 1]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $badPortal])->assertSessionHasErrors('map.portals.0.to');
    }
}
