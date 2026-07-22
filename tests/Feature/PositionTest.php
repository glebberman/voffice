<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use App\Support\MapLimits;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PositionTest extends TestCase
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

    public function test_guests_cannot_save_position(): void
    {
        $this->postJson('/position', ['x' => 5, 'y' => 5, 'room_id' => $this->office->id])->assertUnauthorized();
    }

    public function test_member_position_and_room_are_saved(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/position', ['x' => 20, 'y' => 4, 'room_id' => $this->office->id])->assertNoContent();

        $user->refresh();
        $this->assertSame(20, $user->last_x);
        $this->assertSame(4, $user->last_y);
        $this->assertSame($this->office->id, $user->last_room_id);
    }

    public function test_position_is_validated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/position', ['x' => -1, 'y' => 5, 'room_id' => $this->office->id])->assertUnprocessable();
        $this->actingAs($user)->postJson('/position', ['x' => 5, 'room_id' => $this->office->id])->assertUnprocessable();
        $this->actingAs($user)->postJson('/position', ['x' => 5, 'y' => 5, 'room_id' => 999])->assertUnprocessable();
        $this->actingAs($user)->postJson('/position', ['x' => 5, 'y' => 5])->assertUnprocessable();
        // за краем самой большой допустимой карты
        $this->actingAs($user)
            ->postJson('/position', ['x' => MapLimits::MAX_SIZE, 'y' => 5, 'room_id' => $this->office->id])
            ->assertUnprocessable();
    }

    public function test_position_is_saved_at_the_far_edge_of_the_biggest_map(): void
    {
        $user = User::factory()->create();
        $edge = MapLimits::MAX_COORD;

        $this->actingAs($user)
            ->postJson('/position', ['x' => $edge, 'y' => $edge, 'room_id' => $this->office->id])
            ->assertNoContent();

        $user->refresh();
        $this->assertSame($edge, $user->last_x);
        $this->assertSame($edge, $user->last_y);
    }

    public function test_room_page_passes_position_only_for_the_same_room(): void
    {
        $coworking = Room::where('slug', 'coworking')->firstOrFail();
        $user = User::factory()->create();
        $user->forceFill(['last_x' => 14, 'last_y' => 11, 'last_room_id' => $this->office->id])->save();

        $this->actingAs($user)
            ->get('/rooms/office')
            ->assertInertia(fn (Assert $page) => $page->where('lastPosition', ['x' => 14, 'y' => 11]));

        // в другой комнате сохранённая позиция не применяется
        $this->actingAs($user)
            ->get("/rooms/{$coworking->slug}")
            ->assertInertia(fn (Assert $page) => $page->where('lastPosition', null));
    }
}
