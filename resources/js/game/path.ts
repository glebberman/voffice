import type { GameMap } from './map';
import type { Direction } from './types';

const STEPS: { dir: Direction; dx: number; dy: number }[] = [
    { dir: 'up', dx: 0, dy: -1 },
    { dir: 'down', dx: 0, dy: 1 },
    { dir: 'left', dx: -1, dy: 0 },
    { dir: 'right', dx: 1, dy: 0 },
];

// Потолок обхода: на карте 512×512 недостижимая цель иначе заставила бы
// перебрать все 262 тыс. клеток. Радиуса в несколько десятков тайлов хватает
// для «следовать», а вкладка не встаёт колом.
export const MAX_VISITED = 4000;

/**
 * Первый шаг кратчайшего пути из from к любой проходимой клетке, соседней с
 * target (для режима «следовать»). null — путь не нужен (уже рядом), не
 * существует или цель слишком далеко (превышен потолок обхода).
 */
export function findStep(map: GameMap, from: { x: number; y: number }, target: { x: number; y: number }): Direction | null {
    const near = (x: number, y: number) => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)) <= 1;
    if (near(from.x, from.y)) {
        return null;
    }

    const key = (x: number, y: number) => y * map.width + x;
    const firstStep = new Map<number, Direction>();
    firstStep.set(key(from.x, from.y), null as unknown as Direction);

    // Очередь с указателем головы: Array.shift() сдвигает весь массив (O(n)),
    // из-за чего BFS вырождался в O(n²) и подвешивал вкладку на больших картах.
    const queueX: number[] = [from.x];
    const queueY: number[] = [from.y];
    let head = 0;
    let visited = 0;

    while (head < queueX.length) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;

        if (cx === undefined || cy === undefined) {
            continue;
        }

        if (++visited > MAX_VISITED) {
            return null;
        }

        const stepHere = firstStep.get(key(cx, cy));

        for (const { dir, dx, dy } of STEPS) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (!map.isWalkable(nx, ny) || firstStep.has(key(nx, ny))) {
                continue;
            }
            // направление первого шага наследуется по всему пути
            const step = stepHere ?? dir;
            firstStep.set(key(nx, ny), step);
            if (near(nx, ny)) {
                return step;
            }
            queueX.push(nx);
            queueY.push(ny);
        }
    }

    return null;
}
