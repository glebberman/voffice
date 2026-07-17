<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AvatarTest extends TestCase
{
    use RefreshDatabase;

    private array $valid = [
        'body' => 'female',
        'hair' => 'bob',
        'top' => 'scoop',
        'legs' => 'skirt',
        'tie' => false,
    ];

    public function test_guests_cannot_save_avatar(): void
    {
        $this->postJson('/avatar', $this->valid)->assertUnauthorized();
    }

    public function test_member_saves_avatar_config(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/avatar', $this->valid)->assertOk()->assertJson($this->valid);

        $this->assertSame($this->valid, $user->refresh()->avatar);
    }

    public function test_avatar_keys_are_validated_against_wardrobe(): void
    {
        $user = User::factory()->create();

        // произвольные строки (в т.ч. попытки path traversal) отклоняются
        $this->actingAs($user)->postJson('/avatar', [...$this->valid, 'hair' => '../../secret'])->assertUnprocessable();
        $this->actingAs($user)->postJson('/avatar', [...$this->valid, 'body' => 'alien'])->assertUnprocessable();
        // верх должен существовать у выбранного тела: formal есть только у male
        $this->actingAs($user)->postJson('/avatar', [...$this->valid, 'top' => 'formal'])->assertUnprocessable();
        $this->actingAs($user)->postJson('/avatar', ['body' => 'male'])->assertUnprocessable();
    }

    public function test_presence_channel_payload_includes_avatar(): void
    {
        $this->seed(RoomSeeder::class);
        $roomId = Room::where('slug', 'office')->firstOrFail()->id;
        $user = User::factory()->create();
        $user->forceFill(['avatar' => $this->valid])->save();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => "presence-room.{$roomId}",
        ]);

        $channelData = json_decode($response->json('channel_data'), true);
        $this->assertSame($this->valid, $channelData['user_info']['avatar']);
    }

    public function test_wardrobe_paths_exist_on_disk(): void
    {
        $wardrobe = json_decode(file_get_contents(resource_path('wardrobe.json')), true);
        $base = public_path('assets/lpc/characters/spritesheets');

        $paths = [$wardrobe['eyes']];
        foreach ($wardrobe['bodies'] as $body) {
            $paths[] = $body['body'];
            $paths[] = $body['head'];
            $paths[] = $body['feet'];
            if ($body['tie']) {
                $paths[] = $body['tie'];
            }
            foreach ([...$body['tops'], ...$body['legs']] as $item) {
                $paths[] = $item['path'];
            }
        }
        foreach ($wardrobe['hairs'] as $hair) {
            $paths[] = "hair/{$hair}/adult/walk.png";
        }

        foreach ($paths as $path) {
            $this->assertFileExists("{$base}/{$path}");
        }
    }
}
