<?php

namespace Tests\Feature;

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
     * @return array<string, mixed>
     */
    private function validType(array $overrides = []): array
    {
        return array_merge([
            'slug' => 'bookshelf',
            'label' => 'Стеллаж',
            'sheet' => 'office/Desk, Ornate.png',
            'sx' => 96,
            'sy' => 0,
            'w' => 2,
            'h' => 1,
            'tall' => 2,
        ], $overrides);
    }

    public function test_seeder_fills_catalogue_from_json(): void
    {
        $file = JsonFile::read(resource_path('props.json'))['items'];

        $this->assertSame(count($file), PropType::count());
        $this->assertSame($file['cabinet']['tall'], PropType::where('slug', 'cabinet')->value('tall'));
    }

    public function test_admin_flag_reaches_the_frontend(): void
    {
        // по нему сайдбар решает, показывать ли пункт «Каталог предметов»:
        // обычному пользователю страница ответит 403, и вести его туда незачем
        // fresh(): фабрика не выставляет is_admin на самой модели, а в
        // приложении пользователь всегда приходит из БД со всеми колонками
        $this->actingAs(User::factory()->admin()->create()->fresh())
            ->get('/dashboard')
            ->assertInertia(fn (Assert $p) => $p->where('auth.user.is_admin', true));

        $this->actingAs(User::factory()->create()->fresh())
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
        $this->assertSame(2, $created->tall);

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
            ->post('/props', $this->validType(['sy' => 64]))
            ->assertSessionHasErrors('sheet');

        $this->assertDatabaseMissing('prop_types', ['slug' => 'bookshelf']);
    }

    public function test_sheet_must_come_from_the_assets_folder(): void
    {
        $this->actingAs(User::factory()->admin()->create())
            ->post('/props', $this->validType(['sheet' => '../../../.env']))
            ->assertSessionHasErrors('sheet');
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
            ->post('/props', $this->validType(['sx' => 100]))
            ->assertSessionHasErrors('sx');
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
            ->put("/props/{$cabinet->id}", $this->validType(['slug' => 'cabinet', 'label' => 'Шкаф', 'h' => 3, 'tall' => 0]))
            ->assertRedirect('/props');

        $this->assertSame(3, $cabinet->fresh()->h);

        // карта не менялась, но её предметы теперь занимают больше клеток
        $office = Room::where('slug', 'office')->firstOrFail();
        $this->assertNotEmpty(array_filter(($office->map['props'] ?? []), fn ($p) => $p['type'] === 'cabinet'));
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
