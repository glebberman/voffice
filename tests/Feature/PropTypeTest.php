<?php

namespace Tests\Feature;

use App\Models\PropCategory;
use App\Models\PropOrientation;
use App\Models\PropType;
use App\Models\Room;
use App\Models\User;
use App\Support\JsonFile;
use Database\Seeders\PropTypeSeeder;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PropTypeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
        $this->seed(PropTypeSeeder::class);
        $this->seed(RoomSeeder::class);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @param  array<string, mixed>  $orientationOverrides
     * @return array<string, mixed>
     */
    private function validType(array $overrides = [], array $orientationOverrides = []): array
    {
        return array_merge([
            'slug' => 'bookshelf',
            'label' => 'Стеллаж',
            'description' => '',
            'defaultState' => null,
            'orientations' => [
                array_merge([
                    'dir' => 'south',
                    'sheet' => 'office/Desk, Ornate.png',
                    'sx' => 96,
                    'sy' => 0,
                    'w' => 2,
                    'h' => 1,
                    'tall' => 2,
                ], $orientationOverrides),
            ],
        ], $overrides);
    }

    /** Ориентация south — дефолтная, в тестах ниже интересна именно она. */
    private function south(PropType $type): PropOrientation
    {
        return $type->orientations()->where('dir', 'south')->firstOrFail();
    }

    public function test_seeder_fills_catalogue_from_json(): void
    {
        $file = $this->nested(JsonFile::read(resource_path('props.json')), 'items');

        $this->assertSame(count($file), PropType::count());

        $cabinet = $this->nested($this->nested($this->nested($file, 'cabinet'), 'orientations'), 'south');
        $this->assertSame($cabinet['tall'], $this->south(PropType::where('slug', 'cabinet')->firstOrFail())->tall);

        // телевизор — витрина состояний: выключен по умолчанию, включённый — шум
        $tv = PropType::where('slug', 'tv')->firstOrFail();
        $this->assertSame('off', $tv->default_state);
        $this->assertSame(['sheet' => 'office/TV, Widescreen.png', 'sx' => 0, 'sy' => 64], $this->south($tv)->stateRegions()['on'] ?? null);
    }

    public function test_admin_flag_reaches_the_frontend(): void
    {
        // по нему сайдбар решает, показывать ли пункт «Каталог предметов»:
        // обычному пользователю страница ответит 403, и вести его туда незачем
        // fresh(): фабрика не выставляет is_admin на самой модели, а в
        // приложении пользователь всегда приходит из БД со всеми колонками
        $this->actingAs(User::factory()->admin()->create()->refresh())
            ->get('/dashboard')
            ->assertInertia(fn (Assert $p) => $p->where('auth.user.is_admin', true));

        $this->actingAs(User::factory()->create()->refresh())
            ->get('/dashboard')
            ->assertInertia(fn (Assert $p) => $p->where('auth.user.is_admin', false));
    }

    public function test_only_admin_sees_catalogue(): void
    {
        $this->actingAs(User::factory()->create())->get('/props')->assertForbidden();

        $this->actingAs(User::factory()->admin()->create())
            ->get('/props')
            ->assertInertia(fn (Assert $p) => $p->component('props/index')
                ->has('types', PropType::count())
                ->has('sheets')
                ->has('usage'));
    }

    public function test_non_admin_cannot_change_catalogue(): void
    {
        $user = User::factory()->create();
        $type = PropType::where('slug', 'cabinet')->firstOrFail();

        $this->actingAs($user)->post('/props', $this->validType())->assertForbidden();
        $this->actingAs($user)->put("/props/{$type->id}", $this->validType())->assertForbidden();
        $this->actingAs($user)->delete("/props/{$type->id}")->assertForbidden();
    }

    public function test_admin_creates_type_and_it_becomes_available_to_maps(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/props', $this->validType())->assertRedirect('/props');

        $created = PropType::where('slug', 'bookshelf')->firstOrFail();
        $this->assertSame(2, $this->south($created)->tall);

        // новый тип сразу принимается валидацией карты
        $map = [
            'rows' => ['#######', '#.....#', '#.....#', '#.....#', '#..*..#', '#.....#', '#######'],
            'spawn' => ['x' => 3, 'y' => 4],
            'zones' => [],
            'objects' => [],
            'portals' => [],
            'props' => [['id' => 'b1', 'type' => 'bookshelf', 'x' => 2, 'y' => 5]],
        ];
        $this->actingAs($admin)->put('/rooms/office', ['name' => 'Офис', 'map' => $map])->assertRedirect();
    }

    public function test_region_must_fit_the_sheet(): void
    {
        $admin = User::factory()->admin()->create();

        // «Desk, Ornate.png» — 160×128 px, значит регион 2×3 тайла с sy=64 не влезет
        $this->actingAs($admin)
            ->post('/props', $this->validType([], ['sy' => 64]))
            ->assertSessionHasErrors('orientations.0.sheet');

        $this->assertDatabaseMissing('prop_types', ['slug' => 'bookshelf']);
    }

    public function test_sheet_must_come_from_the_assets_folder(): void
    {
        $this->actingAs(User::factory()->admin()->create())
            ->post('/props', $this->validType([], ['sheet' => '../../../.env']))
            ->assertSessionHasErrors('orientations.0.sheet');
    }

    public function test_slug_is_unique_and_url_safe(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/props', $this->validType(['slug' => 'cabinet']))->assertSessionHasErrors('slug');
        $this->actingAs($admin)->post('/props', $this->validType(['slug' => 'Шкаф Большой']))->assertSessionHasErrors('slug');
    }

    public function test_region_must_be_aligned_to_the_tile_grid(): void
    {
        $this->actingAs(User::factory()->admin()->create())
            ->post('/props', $this->validType([], ['sx' => 100]))
            ->assertSessionHasErrors('orientations.0.sx');
    }

    public function test_used_type_cannot_be_deleted_but_unused_can(): void
    {
        $admin = User::factory()->admin()->create();

        // шкаф стоит в демо-офисе — удалять нельзя
        $used = PropType::where('slug', 'cabinet')->firstOrFail();
        $this->actingAs($admin)->delete("/props/{$used->id}")->assertSessionHasErrors('slug');
        $this->assertDatabaseHas('prop_types', ['slug' => 'cabinet']);

        // а свежесозданный ни на одной карте не стоит
        $this->actingAs($admin)->post('/props', $this->validType());
        $unused = PropType::where('slug', 'bookshelf')->firstOrFail();
        $this->actingAs($admin)->delete("/props/{$unused->id}")->assertRedirect('/props');
        $this->assertDatabaseMissing('prop_types', ['slug' => 'bookshelf']);
    }

    public function test_editing_a_type_changes_geometry_on_every_map(): void
    {
        $admin = User::factory()->admin()->create();
        $cabinet = PropType::where('slug', 'cabinet')->firstOrFail();

        // делаем шкаф целиком основанием: то, что висело в воздухе, станет стеной
        $this->actingAs($admin)
            ->put("/props/{$cabinet->id}", $this->validType(['slug' => 'cabinet', 'label' => 'Шкаф'], ['h' => 3, 'tall' => 0]))
            ->assertRedirect('/props');

        $this->assertSame(3, $this->south($cabinet)->h);

        // карта не менялась, но её предметы теперь занимают больше клеток
        $office = Room::where('slug', 'office')->firstOrFail();
        $this->assertNotEmpty(array_filter(($office->map['props'] ?? []), fn ($p) => $p['type'] === 'cabinet'));
    }

    public function test_description_and_categories_persist(): void
    {
        $admin = User::factory()->admin()->create();
        $work = PropCategory::where('axis', 'purpose')->where('slug', 'work')->firstOrFail();
        $meeting = PropCategory::where('axis', 'room')->where('slug', 'meeting')->firstOrFail();

        $payload = $this->validType(['description' => 'Стеллаж для переговорки', 'categoryIds' => [$work->id, $meeting->id]]);
        $this->actingAs($admin)->post('/props', $payload)->assertRedirect('/props');

        $created = PropType::where('slug', 'bookshelf')->firstOrFail();
        $this->assertSame('Стеллаж для переговорки', $created->description);
        $this->assertSame(['work'], $created->categorySlugs('purpose'));
        $this->assertSame(['meeting'], $created->categorySlugs('room'));

        // категории приходят полным набором: пропавшая из запроса отвязывается
        $this->actingAs($admin)
            ->put("/props/{$created->id}", $this->validType(['categoryIds' => [$meeting->id]]))
            ->assertRedirect('/props');
        $this->assertSame([], $created->refresh()->categorySlugs('purpose'));

        // чужой id не проходит валидацию
        $this->actingAs($admin)
            ->post('/props', $this->validType(['slug' => 'bookshelf2', 'categoryIds' => [999999]]))
            ->assertSessionHasErrors('categoryIds.0');
    }

    public function test_states_persist_and_default_reaches_the_type(): void
    {
        $admin = User::factory()->admin()->create();

        // состояния: тот же размер региона, свой угол на листе
        $payload = $this->validType(['defaultState' => 'off'], ['states' => [
            ['name' => 'off', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 96, 'sy' => 0],
            ['name' => 'on', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 0, 'sy' => 0],
        ]]);
        $this->actingAs($admin)->post('/props', $payload)->assertRedirect('/props');

        $type = PropType::where('slug', 'bookshelf')->firstOrFail();
        $this->assertSame('off', $type->default_state);
        // регионы хранятся словарём по имени и отсортированы
        $this->assertSame(
            ['off' => ['sheet' => 'office/Desk, Ornate.png', 'sx' => 96, 'sy' => 0], 'on' => ['sheet' => 'office/Desk, Ornate.png', 'sx' => 0, 'sy' => 0]],
            $this->south($type)->stateRegions(),
        );
    }

    public function test_default_state_must_exist_and_be_required_with_states(): void
    {
        $admin = User::factory()->admin()->create();
        $states = [['name' => 'off', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 96, 'sy' => 0]];

        // дефолт указывает на несуществующее состояние
        $this->actingAs($admin)
            ->post('/props', $this->validType(['defaultState' => 'on'], ['states' => $states]))
            ->assertSessionHasErrors('defaultState');

        // состояния есть, а дефолта нет
        $this->actingAs($admin)
            ->post('/props', $this->validType(['defaultState' => null], ['states' => $states]))
            ->assertSessionHasErrors('defaultState');
    }

    public function test_state_names_must_match_across_orientations(): void
    {
        $admin = User::factory()->admin()->create();

        $payload = $this->validType(['defaultState' => 'off', 'orientations' => [
            [
                'dir' => 'south', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 96, 'sy' => 0, 'w' => 2, 'h' => 1, 'tall' => 2,
                'states' => [['name' => 'off', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 96, 'sy' => 0]],
            ],
            [
                // у этой стороны состояний нет вовсе — набор имён разошёлся
                'dir' => 'east', 'sheet' => 'office/Card Table.png', 'sx' => 96, 'sy' => 0, 'w' => 1, 'h' => 2, 'tall' => 0,
            ],
        ]]);

        $this->actingAs($admin)->post('/props', $payload)->assertSessionHasErrors('orientations.1.states');
    }

    public function test_state_region_must_fit_the_sheet(): void
    {
        // «Desk, Ornate.png» — 160×128 px; регион 2×3 тайла с sy=64 не влезет
        $this->actingAs(User::factory()->admin()->create())
            ->post('/props', $this->validType(['defaultState' => 'on'], ['states' => [
                ['name' => 'on', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 0, 'sy' => 64],
            ]]))
            ->assertSessionHasErrors('orientations.0.states.0.sheet');
    }

    public function test_orientations_come_as_a_complete_set(): void
    {
        $admin = User::factory()->admin()->create();

        // тип с двумя сторонами: у повёрнутого свой регион и свой footprint
        $payload = $this->validType(['orientations' => [
            ['dir' => 'south', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 96, 'sy' => 0, 'w' => 2, 'h' => 1, 'tall' => 2],
            ['dir' => 'east', 'sheet' => 'office/Card Table.png', 'sx' => 96, 'sy' => 0, 'w' => 1, 'h' => 2, 'tall' => 0],
        ]]);
        $this->actingAs($admin)->post('/props', $payload)->assertRedirect('/props');

        $type = PropType::where('slug', 'bookshelf')->firstOrFail();
        $dirs = fn (): array => array_map(fn (PropOrientation $o): string => $o->dir, $type->refresh()->sortedOrientations());
        $this->assertSame(['south', 'east'], $dirs());

        // ориентации приходят полным набором: пропавшая из запроса удаляется
        $this->actingAs($admin)->put("/props/{$type->id}", $this->validType())->assertRedirect('/props');
        $this->assertSame(['south'], $dirs());
    }

    public function test_map_accepts_existing_direction_and_rejects_missing_one(): void
    {
        $admin = User::factory()->admin()->create();
        $mapWith = fn (array $prop): array => [
            'rows' => ['#######', '#.....#', '#.....#', '#.....#', '#..*..#', '#.....#', '#######'],
            'spawn' => ['x' => 3, 'y' => 4],
            'zones' => [],
            'objects' => [],
            'portals' => [],
            'props' => [$prop],
        ];

        // у шкафа из каталога есть только south
        $this->actingAs($admin)
            ->put('/rooms/office', ['name' => 'Офис', 'map' => $mapWith(['id' => 'c', 'type' => 'cabinet', 'x' => 1, 'y' => 3, 'dir' => 'south'])])
            ->assertRedirect();

        $this->actingAs($admin)
            ->put('/rooms/office', ['name' => 'Офис', 'map' => $mapWith(['id' => 'c', 'type' => 'cabinet', 'x' => 1, 'y' => 3, 'dir' => 'east'])])
            ->assertSessionHasErrors('map.props.0.dir');
    }

    public function test_map_rejects_type_missing_from_catalogue(): void
    {
        $map = [
            'rows' => ['#####', '#...#', '#.*.#', '#...#', '#####'],
            'spawn' => ['x' => 2, 'y' => 2],
            'zones' => [],
            'objects' => [],
            'portals' => [],
            'props' => [['id' => 'x', 'type' => 'batut', 'x' => 1, 'y' => 3]],
        ];

        $this->actingAs(User::factory()->admin()->create())
            ->put('/rooms/office', ['name' => 'Офис', 'map' => $map])
            ->assertSessionHasErrors('map.props.0.type');
    }
}
