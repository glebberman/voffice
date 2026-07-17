import { makeMap, type MapData } from '@/game/map';
import { findStep } from '@/game/path';
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
        let steps = 0;
        for (; steps < 40; steps++) {
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
        expect(steps).toBeLessThan(40);
    });

    it('недостижимая цель — null', () => {
        // тайл стены недостижим «вплотную» только если вокруг него нет проходимых
        // клеток; берём угол карты за периметром
        expect(findStep(walled, { x: 1, y: 1 }, { x: -5, y: -5 })).toBeNull();
    });
});
