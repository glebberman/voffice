<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use App\Support\Wardrobe;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AvatarTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, string|false> — tie: false значит «без галстука» */
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

        $channelData = $this->decodeJson($response->json('channel_data'));
        $this->assertSame($this->valid, $this->nested($channelData, 'user_info')['avatar']);
    }

    public function test_wardrobe_paths_exist_on_disk(): void
    {
        // тот же разбор, которым пользуется приложение: заодно проверяем,
        // что форма wardrobe.json не разъехалась — Wardrobe::all() падает сам
        $wardrobe = Wardrobe::all();
        $base = public_path('assets/lpc/characters/spritesheets');

        $paths = [$wardrobe['eyes']];
        foreach ($wardrobe['bodies'] as $body) {
            $paths[] = $body['body'];
            $paths[] = $body['head'];
            $paths[] = $body['feet'];
            if ($body['tie'] !== false) {
                $paths[] = $body['tie'];
            }
            foreach ([...array_values($body['tops']), ...array_values($body['legs'])] as $path) {
                $paths[] = $path;
            }
        }
        foreach ($wardrobe['hairs'] as $hair) {
            // у двухслойных причёсок walk лежит в подпапках bg/ и fg/, а не файлом
            if (in_array($hair, $wardrobe['layeredHairs'], true)) {
                $paths[] = "hair/{$hair}/adult/bg/walk.png";
                $paths[] = "hair/{$hair}/adult/fg/walk.png";
            } else {
                $paths[] = "hair/{$hair}/adult/walk.png";
            }
        }

        foreach ($paths as $path) {
            $this->assertFileExists("{$base}/{$path}");
        }
    }
}
