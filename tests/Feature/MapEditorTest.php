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

    /**
     * @return array<string, mixed>
     */
    private function validMap(): array
    {
        return [
            'rows' => ['#####', '#...#', '#.*.#', '#...#', '#####'],
            'spawn' => ['x' => 2, 'y' => 2],
            'zones' => [],
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
            ->assertInertia(
                fn (Assert $p) => $p->component('rooms/edit')
                    ->where('room.slug', 'office')
                    ->has('rooms')
                    ->has('propTypes')
                    // категории для группировки карточек каталога (две оси)
                    ->has('propCategories.0', fn (Assert $c) => $c->hasAll(['axis', 'slug', 'label'])),
            );
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

        // портал в несуществующую комнату
        $badPortal = $this->validMap();
        $badPortal['portals'] = [['x' => 1, 'y' => 1, 'to' => 'basement', 'label' => 'x', 'tx' => 1, 'ty' => 1]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $badPortal])->assertSessionHasErrors('map.portals.0.to');
    }

    public function test_zones_are_saved_and_validated(): void
    {
        $admin = User::factory()->admin()->create();

        // корректная зона с типом и приватностью сохраняется
        $ok = $this->validMap();
        $ok['zones'] = [['name' => 'Переговорка', 'x1' => 1, 'y1' => 1, 'x2' => 3, 'y2' => 3, 'isPrivate' => true, 'kind' => 'meeting']];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $ok])->assertRedirect('/rooms/office');
        $saved = Room::where('slug', 'office')->firstOrFail()->map['zones'][0] ?? [];
        $this->assertSame('meeting', $saved['kind'] ?? null);
        $this->assertTrue($saved['isPrivate'] ?? false);

        // зона за границей карты
        $oob = $this->validMap();
        $oob['zones'] = [['name' => 'Z', 'x1' => 1, 'y1' => 1, 'x2' => 99, 'y2' => 2]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $oob])->assertSessionHasErrors('map.zones.0');

        // перевёрнутый прямоугольник
        $flipped = $this->validMap();
        $flipped['zones'] = [['name' => 'Z', 'x1' => 3, 'y1' => 3, 'x2' => 1, 'y2' => 1]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $flipped])->assertSessionHasErrors('map.zones.0');

        // зона без имени
        $noName = $this->validMap();
        $noName['zones'] = [['x1' => 1, 'y1' => 1, 'x2' => 2, 'y2' => 2]];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $noName])->assertSessionHasErrors('map.zones.0.name');
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
        $this->assertSame($map['props'], ($this->office->fresh()->map['props'] ?? []));

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

    public function test_prop_embed_settings_are_validated(): void
    {
        $admin = User::factory()->admin()->create();

        $map = $this->validMap();
        $map['rows'] = ['#######', '#.....#', '#.....#', '#.....#', '#..*..#', '#.....#', '#######'];
        $map['spawn'] = ['x' => 3, 'y' => 4];
        // ноутбук — тип с поведением embed (см. props.json)
        $tv = ['id' => 'lap1', 'type' => 'laptop', 'x' => 2, 'y' => 5];
        $withProp = fn (array $prop): array => array_merge($map, ['props' => [$prop]]);

        // валидные настройки embed сохраняются вместе с картой
        $ok = $withProp($tv + ['settings' => ['label' => 'Доска', 'url' => 'https://example.com']]);
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'Офис', 'map' => $ok])->assertRedirect('/rooms/office');
        $this->assertSame(['label' => 'Доска', 'url' => 'https://example.com'], $this->office->fresh()->map['props'][0]['settings'] ?? null);

        // битый URL — ошибка
        $badUrl = $withProp($tv + ['settings' => ['label' => 'Доска', 'url' => 'не-адрес']]);
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $badUrl])->assertSessionHasErrors('map.props.0.settings');

        // адрес уезжает в iframe: не-http(s) схемы отклоняем (filter_var их пропускал)
        foreach (['javascript://c%0aalert(1)', 'file:///etc/passwd', 'foo://bar'] as $scheme) {
            $this->actingAs($admin)
                ->put('/rooms/office', ['name' => 'X', 'map' => $withProp($tv + ['settings' => ['label' => 'Доска', 'url' => $scheme]])])
                ->assertSessionHasErrors('map.props.0.settings');
        }

        // недозаполненная форма (адрес ещё пуст) не должна блокировать сохранение карты
        $draft = $withProp($tv + ['settings' => ['label' => 'Доска', 'url' => '']]);
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'Офис', 'map' => $draft])->assertRedirect('/rooms/office');

        // настройки у предмета без поведения не нужны
        $onPlain = $withProp(['id' => 'c1', 'type' => 'cabinet', 'x' => 2, 'y' => 5, 'settings' => ['label' => 'X', 'url' => 'https://example.com']]);
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'X', 'map' => $onPlain])->assertSessionHasErrors('map.props.0.settings');

        // без настроек предмет валиден — просто неинтерактивен
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'Офис', 'map' => $withProp($tv)])->assertRedirect('/rooms/office');
    }
}
