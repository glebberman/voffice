import type { GameMap } from './map';
import type { Direction } from './types';

const STEPS: { dir: Direction; dx: number; dy: number }[] = [
    { dir: 'up', dx: 0, dy: -1 },
    { dir: 'down', dx: 0, dy: 1 },
    { dir: 'left', dx: -1, dy: 0 },
    { dir: 'right', dx: 1, dy: 0 },
];

// Первый шаг кратчайшего пути из from к любой проходимой клетке,
// соседней с target (для режима «следовать»). null — путь не нужен
// (уже рядом) или не существует.
export function findStep(map: GameMap, from: { x: number; y: number }, target: { x: number; y: number }): Direction | null {
    const near = (x: number, y: number) => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)) <= 1;
    if (near(from.x, from.y)) {
        return null;
    }

    const key = (x: number, y: number) => y * map.width + x;
    const firstStep = new Map<number, Direction>();
    firstStep.set(key(from.x, from.y), null as unknown as Direction);
    const queue: { x: number; y: number }[] = [{ x: from.x, y: from.y }];

    while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const { dir, dx, dy } of STEPS) {
            const nx = cur.x + dx;
            const ny = cur.y + dy;
            if (!map.isWalkable(nx, ny) || firstStep.has(key(nx, ny))) {
                continue;
            }
            // направление первого шага наследуется по всему пути
            const step = firstStep.get(key(cur.x, cur.y)) ?? dir;
            firstStep.set(key(nx, ny), step);
            if (near(nx, ny)) {
                return step;
            }
            queue.push({ x: nx, y: ny });
        }
    }

    return null;
}
