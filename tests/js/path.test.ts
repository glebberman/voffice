import { makeMap, type MapData } from '@/game/map';
import { findStep, MAX_VISITED } from '@/game/path';
import { describe, expect, it } from 'vitest';
import officeData from '../../resources/maps/office.json';

const office = makeMap(officeData as MapData);

// маленькая карта с перегородкой: прямой путь вправо перекрыт
const walled = makeMap({
    rows: ['#######', '#..#..#', '#..#..#', '#.....#', '#######'],
    spawn: { x: 1, y: 1 },
    zones: [],
    objects: [],
    portals: [],
});

describe('findStep (BFS для «следовать»)', () => {
    it('рядом с целью — шаг не нужен', () => {
        expect(findStep(office, { x: 6, y: 8 }, { x: 7, y: 8 })).toBeNull();
        expect(findStep(office, { x: 6, y: 8 }, { x: 7, y: 9 })).toBeNull(); // диагональ тоже «рядом»
    });

    it('идёт в сторону цели по прямой', () => {
        expect(findStep(office, { x: 6, y: 8 }, { x: 9, y: 8 })).toBe('right');
        expect(findStep(office, { x: 6, y: 9 }, { x: 6, y: 12 })).toBe('down');
    });

    it('обходит препятствие: цель за стеной', () => {
        // из (1,1) к (5,1): стена x=3 в рядах 1-2, путь только низом
        expect(findStep(walled, { x: 1, y: 1 }, { x: 5, y: 1 })).toBe('down');
    });

    it('в переговорку доходит через дверь (симуляция follow)', () => {
        const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
        const pos = { x: 17, y: 8 };
        const target = { x: 20, y: 3 };
        // потолок щедрый: карта может вырасти, важно что путь конечен
        const limit = 200;
        let steps = 0;
        for (; steps < limit; steps++) {
            const dir = findStep(office, pos, target);
            if (dir === null) {
                break;
            }
            pos.x += delta[dir][0];
            pos.y += delta[dir][1];
            expect(office.isWalkable(pos.x, pos.y)).toBe(true);
        }
        // дошли и встали рядом с целью
        expect(Math.max(Math.abs(pos.x - target.x), Math.abs(pos.y - target.y))).toBeLessThanOrEqual(1);
        expect(steps).toBeLessThan(limit);
    });

    it('недостижимая цель — null', () => {
        // тайл стены недостижим «вплотную» только если вокруг него нет проходимых
        // клеток; берём угол карты за периметром
        expect(findStep(walled, { x: 1, y: 1 }, { x: -5, y: -5 })).toBeNull();
    });
});

describe('findStep на большой карте', () => {
    // открытое поле 400×400 со стеной по периметру — worst case для BFS
    const size = 400;
    const big = makeMap({
        rows: Array.from({ length: size }, (_, y) => (y === 0 || y === size - 1 ? '#'.repeat(size) : '#' + '.'.repeat(size - 2) + '#')),
        spawn: { x: 1, y: 1 },
        zones: [],
        objects: [],
        portals: [],
    });

    it('находит направление к далёкой цели быстро', () => {
        const started = performance.now();
        const dir = findStep(big, { x: 5, y: 5 }, { x: 60, y: 5 });
        const elapsed = performance.now() - started;

        expect(dir).toBe('right');
        // раньше здесь была O(n²) из-за Array.shift(): счёт шёл на секунды
        expect(elapsed).toBeLessThan(150);
    });

    it('недостижимая цель на огромной карте не вешает вкладку', () => {
        const started = performance.now();
        // цель далеко за пределами карты: ни одна проходимая клетка с ней не
        // соседствует, поэтому обход идёт до упора в потолок
        const dir = findStep(big, { x: 5, y: 5 }, { x: -50, y: -50 });
        const elapsed = performance.now() - started;

        expect(dir).toBeNull();
        expect(elapsed).toBeLessThan(150);
    });

    it('потолок обхода ограничивает работу при цели вне досягаемости', () => {
        // дальний угол огромного открытого поля лежит за пределом MAX_VISITED
        expect(MAX_VISITED).toBeLessThan(size * size);
        const dir = findStep(big, { x: 1, y: 1 }, { x: size - 2, y: size - 2 });
        expect(dir).toBeNull();
    });
});
