import { fillRect, makeMap, MAX_MAP_SIZE, resizeRows, sealPerimeter, setTile, type MapData } from '@/game/map';
import { describe, expect, it } from 'vitest';

const sample = ['#####', '#...#', '#.D.#', '#...#', '#####'];

describe('sealPerimeter', () => {
    it('обводит карту стеной, не трогая внутренности', () => {
        const open = ['.....', '..D..', '.....'];
        expect(sealPerimeter(open)).toEqual(['#####', '#.D.#', '#####']);
    });

    it('идемпотентен', () => {
        expect(sealPerimeter(sealPerimeter(sample))).toEqual(sealPerimeter(sample));
    });
});

describe('resizeRows', () => {
    it('увеличивает карту, дополняя полом и обводя стеной', () => {
        const bigger = resizeRows(sample, 8, 7);
        expect(bigger).toHaveLength(7);
        expect(bigger.every((r) => r.length === 8)).toBe(true);
        // исходное содержимое сохранилось на своих координатах
        expect(bigger[2][2]).toBe('D');
        // периметр — стена
        expect(bigger[0]).toBe('########');
        expect(bigger[6]).toBe('########');
        expect(bigger.every((r) => r.startsWith('#') && r[7] === '#')).toBe(true);
    });

    it('уменьшает карту, обрезая лишнее', () => {
        const smaller = resizeRows(sample, 4, 4);
        expect(smaller).toHaveLength(4);
        expect(smaller.every((r) => r.length === 4)).toBe(true);
        expect(smaller[0]).toBe('####');
        expect(smaller[3]).toBe('####');
    });

    it('результат всегда остаётся валидной картой', () => {
        for (const [w, h] of [
            [3, 3],
            [10, 4],
            [4, 10],
            [64, 64],
        ]) {
            const rows = resizeRows(sample, w, h);
            const map = makeMap({ rows, spawn: { x: 1, y: 1 }, zones: [], objects: [], portals: [] } as MapData);
            expect(map.width).toBe(w);
            expect(map.height).toBe(h);
            // периметр непроходим
            expect(map.isWalkable(0, 0)).toBe(false);
            expect(map.isWalkable(w - 1, h - 1)).toBe(false);
            // внутри есть проходимое место
            expect(map.isWalkable(1, 1)).toBe(true);
        }
    });

    it('не даёт выйти за пределы допустимого размера', () => {
        expect(resizeRows(sample, 1, 1)).toHaveLength(3); // минимум 3
        const huge = resizeRows(sample, MAX_MAP_SIZE + 100, 5);
        expect(huge[0].length).toBe(MAX_MAP_SIZE);
    });

    it('справляется с большой картой', () => {
        const started = performance.now();
        const big = resizeRows(sample, 512, 512);
        expect(big).toHaveLength(512);
        expect(big[0].length).toBe(512);
        expect(performance.now() - started).toBeLessThan(500);
    });
});

describe('setTile', () => {
    it('меняет один тайл и не трогает остальные строки', () => {
        const next = setTile(sample, 1, 1, '*');
        expect(next[1]).toBe('#*..#');
        expect(next[2]).toBe(sample[2]);
        // неизменённые строки переиспользуются (важно для больших карт)
        expect(next[2]).toBe(sample[2]);
    });

    it('возвращает исходный массив, если менять нечего', () => {
        expect(setTile(sample, 1, 1, '.')).toBe(sample);
        expect(setTile(sample, -1, 0, '#')).toBe(sample);
        expect(setTile(sample, 0, 99, '#')).toBe(sample);
    });
});

describe('fillRect', () => {
    it('заливает прямоугольник', () => {
        const next = fillRect(sample, 1, 1, 3, 3, ';');
        expect(next[1]).toBe('#;;;#');
        expect(next[2]).toBe('#;;;#');
        expect(next[3]).toBe('#;;;#');
        expect(next[0]).toBe('#####');
    });

    it('координаты можно задавать в любом порядке', () => {
        expect(fillRect(sample, 3, 3, 1, 1, ';')).toEqual(fillRect(sample, 1, 1, 3, 3, ';'));
    });

    it('обрезается по границам карты', () => {
        const next = fillRect(sample, -5, -5, 99, 99, ',');
        expect(next.every((r) => r.length === 5)).toBe(true);
        expect(next[0]).toBe(',,,,,');
    });
});
