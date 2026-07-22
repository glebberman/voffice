import { CHAT_RADIUS, type GameMap } from '@/game/map';

interface Positioned {
    id: number;
    x: number;
    y: number;
}

/**
 * С кем должен быть установлен звонок: те, кто в звонке (inCall), в зоне
 * слышимости (радиус либо одна приватная зона — правило proximity-чата) и до
 * кого есть путь. Последнее важно из-за дверей: текстовый чат за закрытую дверь
 * не проходит, и звонок не должен. Видимость приходит извне — её считает сцена
 * и держит закешированной, свой обход на каждое движение был бы дорог.
 *
 * Возвращает отсортированный список для стабильности.
 */
export function callPeers(
    map: GameMap,
    self: Positioned,
    others: Positioned[],
    inCall: ReadonlySet<number>,
    isVisible: (x: number, y: number) => boolean,
): number[] {
    if (!inCall.has(self.id)) {
        return [];
    }
    return others
        .filter((o) => o.id !== self.id && inCall.has(o.id) && map.canHear(self.x, self.y, o.x, o.y) && isVisible(o.x, o.y))
        .map((o) => o.id)
        .sort((a, b) => a - b);
}

// В mesh инициатором (impolite peer) назначаем участника с большим id —
// детерминированно и симметрично для обеих сторон.
export function isInitiator(selfId: number, peerId: number): boolean {
    return selfId > peerId;
}

// Громкость удалённого собеседника по дистанции в тайлах: рядом — полная,
// у края радиуса — тихо, но не в ноль (иначе связь кажется оборванной).
export function volumeForDistance(dist: number, radius: number = CHAT_RADIUS): number {
    if (dist <= 1) {
        return 1;
    }
    if (dist >= radius) {
        return 0.15;
    }
    return Math.max(0.15, 1 - ((dist - 1) / (radius - 1)) * 0.85);
}
