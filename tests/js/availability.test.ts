import {
    blockedByProps,
    canPlace,
    footprintCells,
    hasAccess,
    propZoneCells,
    reachableFromSpawn,
    reachableWithout,
    zoneAvailability,
} from '@/editor/availability';
import type { PropData } from '@/game/map';
import type { PropCatalogue } from '@/game/props';
import { describe, expect, it } from 'vitest';

const CATALOGUE: PropCatalogue = {
    // табурет 1×1 с зоной снизу
    stool: {
        label: 'Табурет',
        orientations: { south: { sheet: 'office/laptop_1.png', sx: 0, sy: 0, w: 1, h: 1, tall: 0, interaction: [{ dx: 0, dy: 1 }] } },
    },
    // столбик 1×1 с зоной справа
    post: {
        label: 'Столбик',
        orientations: { south: { sheet: 'office/laptop_1.png', sx: 0, sy: 0, w: 1, h: 1, tall: 0, interaction: [{ dx: 1, dy: 0 }] } },
    },
    // скамья 2×1 без зоны
    bench: {
        label: 'Скамья',
        orientations: { south: { sheet: 'office/laptop_1.png', sx: 0, sy: 0, w: 2, h: 1, tall: 0 } },
    },
};

const prop = (id: string, type: string, x: number, y: number): PropData => ({ id, type, x, y });

describe('клетки, занятые предметами', () => {
    it('основание блокирует все свои клетки', () => {
        const blocked = blockedByProps(CATALOGUE, [prop('b1', 'bench', 2, 3)], 10);

        expect(blocked.has(3 * 10 + 2)).toBe(true);
        expect(blocked.has(3 * 10 + 3)).toBe(true); // скамья шириной 2
        expect(blocked.has(3 * 10 + 4)).toBe(false);
    });

    it('переносимый предмет не мешает сам себе', () => {
        const props = [prop('b1', 'bench', 2, 3), prop('s1', 'stool', 6, 3)];

        expect(blockedByProps(CATALOGUE, props, 10, 'b1').has(3 * 10 + 2)).toBe(false);
        expect(blockedByProps(CATALOGUE, props, 10, 'b1').has(3 * 10 + 6)).toBe(true);
    });

    it('осиротевший тип прохода не блокирует', () => {
        expect(blockedByProps(CATALOGUE, [prop('x', 'нет-такого', 2, 3)], 10).size).toBe(0);
    });
});

describe('достижимость от спавна', () => {
    // две комнаты, разделённые сплошной стеной поx=3
    const split = ['#######', '#..#..#', '#..#..#', '#######'];

    it('своя комната достижима, соседняя за стеной — нет', () => {
        const reachable = reachableFromSpawn(split, new Set(), { x: 1, y: 1 });

        expect(reachable.has(2 * 7 + 2)).toBe(true); // (2,2) — своя комната
        expect(reachable.has(1 * 7 + 4)).toBe(false); // (4,1) — за стеной
    });

    it('предмет в коридоре отрезает то, что за ним', () => {
        const corridor = ['#####', '#...#', '#####'];
        const blocked = blockedByProps(CATALOGUE, [prop('s1', 'stool', 2, 1)], 5);
        const reachable = reachableFromSpawn(corridor, blocked, { x: 1, y: 1 });

        expect(reachable.has(1 * 5 + 1)).toBe(true); // сам спавн
        expect(reachable.has(1 * 5 + 2)).toBe(false); // клетка под предметом
        expect(reachable.has(1 * 5 + 3)).toBe(false); // за предметом хода нет
    });

    it('спавн на стене или под предметом не даёт ничего', () => {
        expect(reachableFromSpawn(split, new Set(), { x: 3, y: 1 }).size).toBe(0);
        expect(reachableFromSpawn(split, new Set([1 * 7 + 1]), { x: 1, y: 1 }).size).toBe(0);
    });
});

describe('можно ли поставить предмет', () => {
    // скамья 2×1: занимает (x, y) и (x+1, y)
    const bench = { sheet: 'office/laptop_1.png', sx: 0, sy: 0, w: 2, h: 1, tall: 0 };
    const ctx = (over: Partial<Parameters<typeof canPlace>[3]> = {}) => ({
        width: 10,
        height: 10,
        spawn: { x: 9, y: 9 },
        doors: [],
        occupied: new Set<number>(),
        ...over,
    });

    it('на свободном месте — можно', () => {
        expect(canPlace(bench, 2, 2, ctx())).toBe(true);
    });

    it('за краем карты — нельзя', () => {
        expect(canPlace(bench, 9, 2, ctx())).toBe(false); // скамья шириной 2
    });

    it('поверх точки спавна — нельзя (игрок появился бы внутри мебели)', () => {
        expect(canPlace(bench, 8, 9, ctx())).toBe(false);
        expect(canPlace(bench, 8, 8, ctx())).toBe(true); // соседний ряд свободен
    });

    it('поверх двери — нельзя (её было бы не открыть)', () => {
        expect(canPlace(bench, 2, 2, ctx({ doors: [{ x: 3, y: 2 }] }))).toBe(false);
        expect(canPlace(bench, 2, 2, ctx({ doors: [{ x: 4, y: 2 }] }))).toBe(true);
    });

    it('поверх чужого основания — нельзя', () => {
        const occupied = new Set([2 * 10 + 3]);

        expect(canPlace(bench, 2, 2, ctx({ occupied }))).toBe(false);
        expect(canPlace(bench, 4, 2, ctx({ occupied }))).toBe(true);
    });
});

describe('вердикт по зоне предмета', () => {
    const corridor = ['#####', '#...#', '#...#', '#####'];
    const spawn = { x: 1, y: 1 };

    it('зона считается от origin предмета', () => {
        expect(propZoneCells(CATALOGUE, prop('s1', 'stool', 2, 1))).toEqual([{ x: 2, y: 2 }]);
        expect(propZoneCells(CATALOGUE, prop('b1', 'bench', 2, 1))).toEqual([]); // у скамьи зоны нет
    });

    it('предмет доступен, если хотя бы в одну клетку зоны можно встать', () => {
        const stool = prop('s1', 'stool', 2, 1);
        const blocked = blockedByProps(CATALOGUE, [stool], 5);
        const reachable = reachableFromSpawn(corridor, blocked, { x: 1, y: 1 });
        const zone = zoneAvailability(propZoneCells(CATALOGUE, stool), reachable, 5, corridor.length);

        expect(zone).toEqual([{ x: 2, y: 2, ok: true }]);
        expect(hasAccess(zone)).toBe(true);
    });

    it('замурованный предмет недоступен: в зону не дойти', () => {
        // нижний ряд отрезан стеной, спавн наверху
        const walled = ['#####', '#...#', '#####', '#...#', '#####'];
        const stool = prop('s1', 'stool', 2, 3); // зона — (2,4), это стена
        const reachable = reachableFromSpawn(walled, blockedByProps(CATALOGUE, [stool], 5), { x: 1, y: 1 });
        const zone = zoneAvailability(propZoneCells(CATALOGUE, stool), reachable, 5, walled.length);

        expect(zone).toEqual([{ x: 2, y: 4, ok: false }]);
        expect(hasAccess(zone)).toBe(false);
    });

    it('клетка за краем карты недоступна и не заворачивается на соседнюю строку', () => {
        const open = ['...', '...', '...']; // сплошной пол 3×3, дойти можно куда угодно
        const reachable = reachableFromSpawn(open, new Set(), { x: 0, y: 0 });

        // предмет у левого края: (-1,1) по индексу — это (2,0), и она достижима
        expect(reachable.has(1 * 3 - 1)).toBe(true);
        expect(zoneAvailability([{ x: -1, y: 1 }], reachable, 3, 3)).toEqual([{ x: -1, y: 1, ok: false }]);
        // у правого края (типичная зона dx:+1): (3,1) по индексу — это (0,2)
        expect(reachable.has(1 * 3 + 3)).toBe(true);
        expect(zoneAvailability([{ x: 3, y: 1 }], reachable, 3, 3)).toEqual([{ x: 3, y: 1, ok: false }]);
    });

    it('предмет, встав на место, может сам отрезать свою зону', () => {
        // коридор в одну клетку: столбик на (2,1) перекрывает единственный путь
        // к своей же зоне (3,1)
        const narrow = ['#####', '#...#', '#####'];
        const reachable = reachableFromSpawn(narrow, new Set(), spawn);
        const ghost = { type: 'post', x: 2, y: 1 };
        const future = new Set(footprintCells(CATALOGUE, ghost).map((c) => c.y * 5 + c.x));

        const after = reachableWithout(reachable, future, 5, spawn);

        expect(zoneAvailability(propZoneCells(CATALOGUE, ghost), after, 5, narrow.length)).toEqual([{ x: 3, y: 1, ok: false }]);
        // без учёта будущего основания та же клетка выглядела бы доступной
        expect(zoneAvailability(propZoneCells(CATALOGUE, ghost), reachable, 5, narrow.length)).toEqual([{ x: 3, y: 1, ok: true }]);
    });

    it('предмет без зоны недоступен по определению', () => {
        expect(hasAccess([])).toBe(false);
    });
});
