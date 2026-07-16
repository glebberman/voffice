<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OfficeTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page(): void
    {
        $this->get('/office')->assertRedirect('/login');
    }

    public function test_office_redirects_to_default_room(): void
    {
        $this->seed(RoomSeeder::class);
        $this->actingAs(User::factory()->create());

        $this->get('/office')->assertRedirect('/rooms/office');
    }

    public function test_office_redirects_to_last_visited_room(): void
    {
        $this->seed(RoomSeeder::class);
        $coworking = Room::where('slug', 'coworking')->firstOrFail();
        $user = User::factory()->create();
        $user->forceFill(['last_room_id' => $coworking->id])->save();

        $this->actingAs($user)->get('/office')->assertRedirect('/rooms/coworking');
    }
}
