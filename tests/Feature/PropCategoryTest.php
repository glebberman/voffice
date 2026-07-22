<?php

namespace Tests\Feature;

use App\Models\PropCategory;
use App\Models\PropType;
use App\Models\User;
use Database\Seeders\PropTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropCategoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PropTypeSeeder::class);
    }

    public function test_seeder_fills_categories_and_links_from_json(): void
    {
        // стартовая таксономия: шесть назначений и четыре типа помещений
        $this->assertSame(6, PropCategory::where('axis', 'purpose')->count());
        $this->assertSame(4, PropCategory::where('axis', 'room')->count());

        $tv = PropType::where('slug', 'tv')->firstOrFail();
        $this->assertSame(['media'], $tv->categorySlugs('purpose'));
        $this->assertSame(['meeting', 'lounge'], $tv->categorySlugs('room'));
        $this->assertNotSame('', $tv->description);
    }

    public function test_only_admin_manages_categories(): void
    {
        $user = User::factory()->create();
        $category = PropCategory::where('slug', 'work')->firstOrFail();

        $this->actingAs($user)->post('/prop-categories', ['axis' => 'purpose', 'slug' => 'x', 'label' => 'X'])->assertForbidden();
        $this->actingAs($user)->put("/prop-categories/{$category->id}", ['axis' => 'purpose', 'slug' => 'work', 'label' => 'X'])->assertForbidden();
        $this->actingAs($user)->delete("/prop-categories/{$category->id}")->assertForbidden();
    }

    public function test_slug_is_unique_per_axis_but_may_repeat_on_the_other(): void
    {
        $admin = User::factory()->admin()->create();

        // kitchen уже есть на оси room — на оси purpose такой слог свободен
        $this->actingAs($admin)
            ->post('/prop-categories', ['axis' => 'purpose', 'slug' => 'kitchen', 'label' => 'Кухонное'])
            ->assertRedirect('/props');

        $this->actingAs($admin)
            ->post('/prop-categories', ['axis' => 'room', 'slug' => 'kitchen', 'label' => 'Ещё кухня'])
            ->assertSessionHasErrors('slug');

        $this->actingAs($admin)
            ->post('/prop-categories', ['axis' => 'floor', 'slug' => 'x', 'label' => 'X'])
            ->assertSessionHasErrors('axis');
    }

    public function test_new_category_lands_at_the_end_of_its_axis(): void
    {
        $this->actingAs(User::factory()->admin()->create())
            ->post('/prop-categories', ['axis' => 'room', 'slug' => 'street', 'label' => 'Улица'])
            ->assertRedirect('/props');

        $street = PropCategory::where('axis', 'room')->where('slug', 'street')->firstOrFail();
        $max = PropCategory::where('axis', 'room')->where('slug', '!=', 'street')->max('sort');
        $this->assertSame((is_numeric($max) ? (int) $max : 0) + 1, $street->sort);
    }

    public function test_rename_keeps_links_and_place_in_the_axis(): void
    {
        $admin = User::factory()->admin()->create();
        $media = PropCategory::where('axis', 'purpose')->where('slug', 'media')->firstOrFail();
        $sort = $media->sort;

        // инлайн-переименование шлёт только ярлык — место в оси меняться не должно
        $this->actingAs($admin)
            ->put("/prop-categories/{$media->id}", ['axis' => 'purpose', 'slug' => 'media', 'label' => 'Экраны'])
            ->assertRedirect('/props');

        $this->assertSame('Экраны', $media->refresh()->label);
        $this->assertSame($sort, $media->sort);
        $this->assertSame(['media'], PropType::where('slug', 'tv')->firstOrFail()->categorySlugs('purpose'));

        // а явный sort по-прежнему слушается
        $this->actingAs($admin)
            ->put("/prop-categories/{$media->id}", ['axis' => 'purpose', 'slug' => 'media', 'label' => 'Экраны', 'sort' => 9])
            ->assertRedirect('/props');

        $this->assertSame(9, $media->refresh()->sort);
    }

    public function test_deleting_category_detaches_types_but_keeps_them(): void
    {
        $admin = User::factory()->admin()->create();
        $media = PropCategory::where('axis', 'purpose')->where('slug', 'media')->firstOrFail();

        $this->actingAs($admin)->delete("/prop-categories/{$media->id}")->assertRedirect('/props');

        $tv = PropType::where('slug', 'tv')->firstOrFail();
        $this->assertSame([], $tv->categorySlugs('purpose'));
        $this->assertSame(['meeting', 'lounge'], $tv->categorySlugs('room')); // другая ось не тронута
    }
}
