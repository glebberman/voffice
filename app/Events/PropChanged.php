<?php

namespace App\Events;

use App\Models\Room;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Предмет переключили (телевизор включили / выключили). Уходит всем в комнате,
 * включая самого переключившего: он применил состояние оптимистично, а эхо
 * подтверждает и синхронизирует остальных.
 *
 * ShouldBroadcastNow — как у дверей и чата: через очередь предмет переключался
 * бы с задержкой, а при мёртвом воркере не переключался бы вовсе.
 */
class PropChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Room $room,
        public string $propId,
        public string $state,
    ) {}

    public function broadcastOn(): PresenceChannel
    {
        return new PresenceChannel('room.'.$this->room->id);
    }

    public function broadcastAs(): string
    {
        return 'prop.changed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return ['id' => $this->propId, 'state' => $this->state];
    }
}
