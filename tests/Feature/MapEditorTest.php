<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use Database\Seeders\PropTypeSeeder;
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
        // типы предметов — из каталога в БД: карта ссылается на них по slug
        $this->seed(PropTypeSeeder::class);
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

    public function test_large_map_is_accepted_and_oversized_rejected(): void
    {
        $admin = User::factory()->admin()->create();

        // 512×512 — заявленный предел «адекватной работы»
        $big = [
            'rows' => array_map(
                fn (int $y) => $y === 0 || $y === 511 ? str_repeat('#', 512) : '#'.str_repeat('.', 510).'#',
                range(0, 511),
            ),
            'spawn' => ['x' => 5, 'y' => 5],
            'zones' => [],
            'objects' => [],
            'portals' => [],
        ];

        $this->actingAs($admin)->put('/rooms/office', ['name' => 'Кампус', 'map' => $big])->assertRedirect('/rooms/office');
        $this->assertCount(512, $this->office->refresh()->map['rows']);

        // 513 строк — уже за пределом
        $tooTall = $big;
        $tooTall['rows'][] = str_repeat('#', 512);
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $tooTall])->assertSessionHasErrors('map.rows');

        // строка длиннее 512 символов — тоже
        $tooWide = $big;
        $tooWide['rows'][1] = '#'.str_repeat('.', 511).'#';
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $tooWide])->assertSessionHasErrors();
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

    public function test_props_are_saved_and_validated(): void
    {
        $admin = User::factory()->admin()->create();

        // карта повыше: высокой части предмета нужно место сверху
        $map = $this->validMap();
        $map['rows'] = ['#######', '#.....#', '#.....#', '#.....#', '#..*..#', '#.....#', '#######'];
        $map['spawn'] = ['x' => 3, 'y' => 4];
        $map['props'] = [['id' => 'c1', 'type' => 'cabinet', 'x' => 2, 'y' => 5]];

        $this->actingAs($admin)->put('/rooms/office', ['name' => 'Офис', 'map' => $map])->assertRedirect();
        $this->assertSame($map['props'], $this->office->fresh()->map['props']);

        // тип не из каталога
        $unknown = $map;
        $unknown['props'] = [['id' => 'c1', 'type' => 'batut', 'x' => 2, 'y' => 5]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $unknown])
            ->assertSessionHasErrors('map.props.0.type');

        // основание вылезает за границу карты
        $oob = $map;
        $oob['props'] = [['id' => 'c1', 'type' => 'cabinet', 'x' => 6, 'y' => 5]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $oob])
            ->assertSessionHasErrors('map.props.0');

        // высокой части (+2 тайла) не хватает места сверху
        $noRoom = $map;
        $noRoom['props'] = [['id' => 'c1', 'type' => 'cabinet', 'x' => 2, 'y' => 1]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $noRoom])
            ->assertSessionHasErrors('map.props.0');
    }
}
