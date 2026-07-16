<?php

namespace Tests\Feature;

use App\Events\MessageSent;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MessageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
    }

    public function test_guests_cannot_post_messages(): void
    {
        $this->postJson('/messages', ['body' => 'привет'])->assertUnauthorized();
    }

    public function test_member_posts_message_and_event_is_broadcast(): void
    {
        Event::fake([MessageSent::class]);
        $user = User::factory()->create(['name' => 'Аня']);

        $response = $this->actingAs($user)->postJson('/messages', ['body' => 'Всем привет!']);

        $response->assertCreated()->assertJson([
            'userId' => $user->id,
            'name' => 'Аня',
            'body' => 'Всем привет!',
        ]);

        $this->assertDatabaseHas('messages', [
            'user_id' => $user->id,
            'room_id' => 1,
            'body' => 'Всем привет!',
        ]);

        Event::assertDispatched(MessageSent::class, fn (MessageSent $e) => $e->message->body === 'Всем привет!');
    }

    public function test_message_body_is_validated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/messages', ['body' => ''])->assertUnprocessable();
        $this->actingAs($user)->postJson('/messages', ['body' => str_repeat('ы', 501)])->assertUnprocessable();
    }

    public function test_office_page_shows_last_fifty_messages_in_order(): void
    {
        $user = User::factory()->create();
        foreach (range(1, 60) as $i) {
            Message::create(['room_id' => 1, 'user_id' => $user->id, 'body' => "msg {$i}"]);
        }

        $this->actingAs($user)
            ->get('/office')
            ->assertInertia(
                fn (Assert $page) => $page
                    ->component('office')
                    ->has('history', 50)
                    ->where('history.0.body', 'msg 11')
                    ->where('history.49.body', 'msg 60'),
            );
    }

    public function test_broadcast_payload_contains_expected_fields(): void
    {
        $user = User::factory()->create(['name' => 'Боря']);
        $message = Message::create(['room_id' => 1, 'user_id' => $user->id, 'body' => 'проверка']);

        $event = new MessageSent($message);

        $this->assertSame('presence-office', $event->broadcastOn()->name);
        $this->assertSame('message.sent', $event->broadcastAs());
        $payload = $event->broadcastWith();
        $this->assertSame($user->id, $payload['userId']);
        $this->assertSame('Боря', $payload['name']);
        $this->assertSame('проверка', $payload['body']);
    }
}
