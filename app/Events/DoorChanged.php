<?php

namespace App\Events;

use App\Models\Room;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Дверь открыли, закрыли, заперли или отперли. Уходит всем в комнате, включая
 * самого дёрнувшего: у него дверь тоже перерисуется от эха, и не нужно
 * угадывать состояние заранее.
 *
 * ShouldBroadcastNow — как и чат: через очередь дверь открывалась бы с
 * задержкой, а при мёртвом воркере не открывалась бы вовсе.
 */
class DoorChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Room $room,
        public string $doorId,
        public bool $closed,
        public bool $locked,
    ) {}

    public function broadcastOn(): PresenceChannel
    {
        return new PresenceChannel('room.'.$this->room->id);
    }

    public function broadcastAs(): string
    {
        return 'door.changed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return ['id' => $this->doorId, 'closed' => $this->closed, 'locked' => $this->locked];
    }
}
