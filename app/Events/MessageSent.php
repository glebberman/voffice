<?php

namespace App\Events;

use App\Models\Message;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * ShouldBroadcastNow, а не ShouldBroadcast: сообщение уходит в Reverb прямо из
 * запроса, минуя очередь.
 *
 * Через очередь чат получал задержку в размере интервала опроса (до 3 с) и,
 * что хуже, полностью зависел от живого контейнера queue — стоило воркеру
 * упасть, и собеседники переставали видеть сообщения, хотя те исправно
 * сохранялись в базу. Публикация в Reverb — это один HTTP-запрос внутри
 * docker-сети, ради него очередь не нужна.
 */
class MessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Message $message) {}

    public function broadcastOn(): PresenceChannel
    {
        return new PresenceChannel('room.'.$this->message->room_id);
    }

    public function broadcastAs(): string
    {
        return 'message.sent';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => $this->message->id,
            'userId' => $this->message->user_id,
            'name' => $this->message->user->name,
            'body' => $this->message->body,
            'at' => $this->message->created_at->toIso8601String(),
        ];
    }
}
