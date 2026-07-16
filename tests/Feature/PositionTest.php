<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PositionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
    }

    public function test_guests_cannot_save_position(): void
    {
        $this->postJson('/position', ['x' => 5, 'y' => 5])->assertUnauthorized();
    }

    public function test_member_position_is_saved(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/position', ['x' => 20, 'y' => 4])->assertNoContent();

        $user->refresh();
        $this->assertSame(20, $user->last_x);
        $this->assertSame(4, $user->last_y);
    }

    public function test_position_is_validated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/position', ['x' => -1, 'y' => 5])->assertUnprocessable();
        $this->actingAs($user)->postJson('/position', ['x' => 5])->assertUnprocessable();
        $this->actingAs($user)->postJson('/position', ['x' => 'abc', 'y' => 5])->assertUnprocessable();
    }

    public function test_office_page_passes_stored_position(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['last_x' => 14, 'last_y' => 11])->save();

        $this->actingAs($user)
            ->get('/office')
            ->assertInertia(fn (Assert $page) => $page->where('lastPosition', ['x' => 14, 'y' => 11]));

        $fresh = User::factory()->create();
        $this->actingAs($fresh)
            ->get('/office')
            ->assertInertia(fn (Assert $page) => $page->where('lastPosition', null));
    }
}
