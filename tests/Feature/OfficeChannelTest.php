<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OfficeChannelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
    }

    public function test_guests_cannot_join_the_office_presence_channel(): void
    {
        $this->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => 'presence-office',
        ])->assertForbidden();
    }

    public function test_members_receive_presence_payload_with_id_and_name(): void
    {
        $user = User::factory()->create(['name' => 'Аня']);

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => 'presence-office',
        ]);

        $response->assertOk()->assertJsonStructure(['auth', 'channel_data']);

        $channelData = json_decode($response->json('channel_data'), true);

        // pusher-протокол сериализует user_id строкой
        $this->assertEquals($user->id, $channelData['user_id']);
        $this->assertSame(['id' => $user->id, 'name' => 'Аня'], $channelData['user_info']);
    }
}
