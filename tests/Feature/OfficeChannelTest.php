<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OfficeChannelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoomSeeder::class);
    }

    public function test_guests_cannot_join_a_room_presence_channel(): void
    {
        $roomId = Room::where('slug', 'office')->firstOrFail()->id;

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => "presence-room.{$roomId}",
        ])->assertForbidden();
    }

    public function test_members_receive_presence_payload_with_id_and_name(): void
    {
        $roomId = Room::where('slug', 'office')->firstOrFail()->id;
        $user = User::factory()->create(['name' => 'Аня']);

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => "presence-room.{$roomId}",
        ]);

        $response->assertOk()->assertJsonStructure(['auth', 'channel_data']);

        $channelData = $this->decodeJson($response->json('channel_data'));

        // pusher-протокол сериализует user_id строкой
        $this->assertEquals($user->id, $channelData['user_id']);
        $this->assertSame(['id' => $user->id, 'name' => 'Аня', 'avatar' => null], $this->nested($channelData, 'user_info'));
    }

    public function test_nonexistent_room_channel_is_forbidden(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => 'presence-room.999',
        ])->assertForbidden();
    }
}
