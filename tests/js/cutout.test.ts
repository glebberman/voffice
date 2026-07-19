import { CUTOUT_RX, CUTOUT_RY, cutoutPolygon, SPRITE_TOP } from '@/game/cutout';
import { describe, expect, it } from 'vitest';

const TILE = 32;

// центр тайла по вертикали, как его считает сцена (centerOf)
const centerY = (row: number) => row * TILE + TILE / 2;

/** Точки полигона парами — так удобнее проверять геометрию. */
function points(poly: number[]): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < poly.length; i += 2) {
        out.push({ x: poly[i], y: poly[i + 1] });
    }
    return out;
}

describe('вырез не поднимается выше макушки', () => {
    it('ни одна точка не выше линии среза', () => {
        const poly = points(cutoutPolygon(100, 200, 180));

        expect(Math.min(...poly.map((p) => p.y))).toBe(180);
    });

    it('без среза (линия далеко вверху) остаётся полный эллипс', () => {
        const poly = points(cutoutPolygon(100, 200, -9999));

        expect(Math.min(...poly.map((p) => p.y))).toBeCloseTo(200 - CUTOUT_RY, 5);
        expect(Math.max(...poly.map((p) => p.y))).toBeCloseTo(200 + CUTOUT_RY, 5);
    });

    it('срез не трогает низ и бока овала', () => {
        const poly = points(cutoutPolygon(100, 200, 180));

        expect(Math.max(...poly.map((p) => p.y))).toBeCloseTo(200 + CUTOUT_RY, 5);
        expect(Math.min(...poly.map((p) => p.x))).toBeCloseTo(100 - CUTOUT_RX, 5);
        expect(Math.max(...poly.map((p) => p.x))).toBeCloseTo(100 + CUTOUT_RX, 5);
    });
});

describe('линия среза = граница тайловой строки', () => {
    it('макушка персонажа на строке r приходится ровно на верх строки r-1', () => {
        for (const row of [1, 5, 40]) {
            expect(centerY(row) - SPRITE_TOP).toBe((row - 1) * TILE);
        }
    });

    // Правило видимости: просвечивать можно только то, что стоит на уровне
    // персонажа или ниже. Верхушка стены на строке y «стоит» на стене (y+1).
    it('верхушка стены за спиной (её стена выше персонажа) не задета вырезом', () => {
        const row = 10;
        const topY = centerY(row) - SPRITE_TOP;
        const poly = points(cutoutPolygon(0, centerY(row) - 14, topY));
        const cutTop = Math.min(...poly.map((p) => p.y));

        // верхушка на строке row-2 стоит на стене (row-1) — выше персонажа
        const behindBottom = (row - 1) * TILE; // низ этой верхушки
        expect(cutTop).toBeGreaterThanOrEqual(behindBottom);

        // а верхушка на строке row-1 стоит на стене row — на уровне персонажа
        const frontBottom = row * TILE;
        expect(cutTop).toBeLessThan(frontBottom);
    });

    it('высокая часть предмета, стоящего выше персонажа, лежит целиком над срезом', () => {
        const row = 10;
        const topY = centerY(row) - SPRITE_TOP;

        // предмет с основанием на строке row-1 (выше персонажа), высота +3:
        // его спрайт занимает строки row-4..row-2 — весь над линией среза
        const baseRow = row - 1;
        const tall = 3;
        const spriteBottom = baseRow * TILE; // низ высокой части = верх основания

        expect(spriteBottom).toBeLessThanOrEqual(topY);
        expect((baseRow - tall) * TILE).toBeLessThan(spriteBottom);
    });

    it('высокая часть предмета на уровне персонажа попадает под вырез', () => {
        const row = 10;
        const topY = centerY(row) - SPRITE_TOP;

        // основание на строке row+1 (ниже персонажа), высота +2 →
        // спрайт занимает строки row-1..row и перекрывает персонажа
        const spriteBottom = (row + 1) * TILE;
        const spriteTop = (row - 1) * TILE;

        expect(spriteBottom).toBeGreaterThan(topY);
        expect(spriteTop).toBeGreaterThanOrEqual(topY);
    });
});
