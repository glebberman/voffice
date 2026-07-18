import { makeMap, type MapData } from '@/game/map';
import { PROP_SPECS, PROP_TYPES, propBaseRect, propFootprint, propSpec, propTallRect } from '@/game/props';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LPC_DIR = fileURLToPath(new URL('../../public/assets/lpc', import.meta.url));

// карта 8×8: пол внутри, стена по периметру
const baseMap = (props: MapData['props']): MapData => ({
    rows: ['########', '#......#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
    spawn: { x: 1, y: 1 },
    zones: [],
    objects: [],
    portals: [],
    props,
});

describe('каталог предметов', () => {
    it('спрайт каждого предмета есть на диске', () => {
        const missing = PROP_TYPES.filter((type) => !existsSync(`${LPC_DIR}/${PROP_SPECS[type].sheet}`));
        expect(missing).toEqual([]);
    });

    it('у каждого предмета положительное основание и неотрицательная высота', () => {
        for (const type of PROP_TYPES) {
            const spec = PROP_SPECS[type];
            expect(spec.w, type).toBeGreaterThan(0);
            expect(spec.h, type).toBeGreaterThan(0);
            expect(spec.tall, type).toBeGreaterThanOrEqual(0);
            expect(spec.label, type).toBeTruthy();
        }
    });

    it('неизвестный тип не ломает propSpec', () => {
        expect(propSpec('нет-такого')).toBeNull();
    });
});

describe('геометрия спрайта', () => {
    it('основание лежит под высокой частью, обе части вместе дают полный спрайт', () => {
        const spec = PROP_SPECS['cabinet']; // 2×1, высота +2
        const tall = propTallRect(spec)!;
        const base = propBaseRect(spec);

        expect(tall.height).toBe(2 * 32);
        expect(base.y).toBe(tall.y + tall.height);
        expect(base.height).toBe(32);
        expect(base.width).toBe(2 * 32);
    });

    it('у предмета без высоты нет верхней части', () => {
        expect(propTallRect(PROP_SPECS['bin'])).toBeNull();
    });

    it('footprint перечисляет все клетки основания', () => {
        const cells = propFootprint({ id: 'p', type: 'cabinet', x: 3, y: 4 });
        expect(cells).toEqual([
            { x: 3, y: 4 },
            { x: 4, y: 4 },
        ]);
    });
});

describe('проходимость', () => {
    it('основание предмета блокирует проход', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'cabinet', x: 2, y: 4 }]));

        expect(map.isWalkable(2, 4)).toBe(false);
        expect(map.isWalkable(3, 4)).toBe(false); // предмет шириной 2
        expect(map.isWalkable(4, 4)).toBe(true);
    });

    it('за высокой частью можно пройти', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'cabinet', x: 2, y: 4 }]));

        expect(map.isWalkable(2, 3)).toBe(true); // высокая часть — не препятствие
        expect(map.isWalkable(2, 2)).toBe(true);
    });

    it('предмет неизвестного типа игнорируется, а не роняет карту', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'нет-такого', x: 2, y: 4 }]));

        expect(map.isWalkable(2, 4)).toBe(true);
    });

    it('карта без props работает как раньше', () => {
        const map = makeMap(baseMap(undefined));

        expect(map.props).toEqual([]);
        expect(map.isWalkable(2, 4)).toBe(true);
    });

    it('спавн уезжает на дефолтный, если сохранённая клетка занята предметом', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'bin', x: 5, y: 5 }]));

        expect(map.resolveSpawn({ x: 5, y: 5 })).toEqual({ x: 1, y: 1 });
    });
});

describe('верхушка стены', () => {
    it('клетка над стеной — верхушка, а сама стена — нет', () => {
        const map = makeMap(baseMap([]));

        expect(map.isWallCrown(3, 6)).toBe(true); // под ней нижняя стена карты
        expect(map.isWallCrown(3, 7)).toBe(false); // это уже сама стена
        expect(map.isWallCrown(3, 3)).toBe(false); // чистый пол
    });
});
