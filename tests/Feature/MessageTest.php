<?php

namespace Tests\Feature;

use App\Events\MessageSent;
use App\Models\Message;
use App\Models\Room;
use App\Models\User;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MessageTest extends TestCase
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

    public function test_guests_cannot_post_messages(): void
    {
        $this->postJson('/messages', ['body' => 'привет', 'room_id' => $this->office->id])->assertUnauthorized();
    }

    public function test_member_posts_message_and_event_is_broadcast(): void
    {
        Event::fake([MessageSent::class]);
        $user = User::factory()->create(['name' => 'Аня']);

        $response = $this->actingAs($user)->postJson('/messages', [
            'body' => 'Всем привет!',
            'room_id' => $this->office->id,
        ]);

        $response->assertCreated()->assertJson([
            'userId' => $user->id,
            'name' => 'Аня',
            'body' => 'Всем привет!',
        ]);

        $this->assertDatabaseHas('messages', [
            'user_id' => $user->id,
            'room_id' => $this->office->id,
            'body' => 'Всем привет!',
        ]);

        Event::assertDispatched(MessageSent::class, fn (MessageSent $e) => $e->message->body === 'Всем привет!');
    }

    public function test_message_is_validated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/messages', ['body' => '', 'room_id' => $this->office->id])->assertUnprocessable();
        $this->actingAs($user)->postJson('/messages', ['body' => str_repeat('ы', 501), 'room_id' => $this->office->id])->assertUnprocessable();
        $this->actingAs($user)->postJson('/messages', ['body' => 'привет'])->assertUnprocessable();
        $this->actingAs($user)->postJson('/messages', ['body' => 'привет', 'room_id' => 999])->assertUnprocessable();
    }

    public function test_room_page_shows_last_fifty_messages_of_that_room_only(): void
    {
        $user = User::factory()->create();
        $coworking = Room::where('slug', 'coworking')->firstOrFail();

        foreach (range(1, 60) as $i) {
            Message::create(['room_id' => $this->office->id, 'user_id' => $user->id, 'body' => "msg {$i}"]);
        }
        Message::create(['room_id' => $coworking->id, 'user_id' => $user->id, 'body' => 'из коворкинга']);

        $this->actingAs($user)
            ->get('/rooms/office')
            ->assertInertia(
                fn (Assert $page) => $page
                    ->has('history', 50)
                    ->where('history.0.body', 'msg 11')
                    ->where('history.49.body', 'msg 60'),
            );

        $this->actingAs($user)
            ->get('/rooms/coworking')
            ->assertInertia(fn (Assert $page) => $page->has('history', 1)->where('history.0.body', 'из коворкинга'));
    }

    public function test_broadcast_goes_to_the_message_room_channel(): void
    {
        $user = User::factory()->create(['name' => 'Боря']);
        $coworking = Room::where('slug', 'coworking')->firstOrFail();
        $message = Message::create(['room_id' => $coworking->id, 'user_id' => $user->id, 'body' => 'проверка']);

        $event = new MessageSent($message);

        $this->assertSame("presence-room.{$coworking->id}", $event->broadcastOn()->name);
        $this->assertSame('message.sent', $event->broadcastAs());
        $payload = $event->broadcastWith();
        $this->assertSame($user->id, $payload['userId']);
        $this->assertSame('проверка', $payload['body']);
    }
}
