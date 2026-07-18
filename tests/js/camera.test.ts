import { approach, cameraOffset, chunkRangeContains, visibleChunkRange } from '@/game/camera';
import { describe, expect, it } from 'vitest';

const viewport = { width: 800, height: 600 };

describe('cameraOffset', () => {
    const world = { width: 4000, height: 3000 };

    it('центрирует персонажа в середине большой карты', () => {
        const offset = cameraOffset({ x: 2000, y: 1500 }, viewport, world);
        // персонаж должен оказаться ровно в центре вьюпорта
        expect(2000 + offset.x).toBe(viewport.width / 2);
        expect(1500 + offset.y).toBe(viewport.height / 2);
    });

    it('упирается в левый и верхний край: за картой не видно пустоты', () => {
        const offset = cameraOffset({ x: 10, y: 10 }, viewport, world);
        expect(offset.x).toBe(0);
        expect(offset.y).toBe(0);
    });

    it('упирается в правый и нижний край', () => {
        const offset = cameraOffset({ x: world.width - 10, y: world.height - 10 }, viewport, world);
        expect(offset.x).toBe(viewport.width - world.width);
        expect(offset.y).toBe(viewport.height - world.height);
    });

    it('видимая область всегда внутри карты', () => {
        for (const p of [
            { x: 0, y: 0 },
            { x: 2000, y: 1500 },
            { x: 4000, y: 3000 },
            { x: -500, y: 9999 },
        ]) {
            const offset = cameraOffset(p, viewport, world);
            const left = -offset.x;
            const top = -offset.y;
            expect(left).toBeGreaterThanOrEqual(0);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(left + viewport.width).toBeLessThanOrEqual(world.width);
            expect(top + viewport.height).toBeLessThanOrEqual(world.height);
        }
    });

    it('карта меньше вьюпорта — центрируется целиком', () => {
        const small = { width: 400, height: 200 };
        const offset = cameraOffset({ x: 200, y: 100 }, viewport, small);
        expect(offset.x).toBe((viewport.width - small.width) / 2);
        expect(offset.y).toBe((viewport.height - small.height) / 2);

        // и не зависит от того, где стоит персонаж
        expect(cameraOffset({ x: 0, y: 0 }, viewport, small)).toEqual(offset);
    });

    it('оси независимы: карта широкая, но низкая', () => {
        const wide = { width: 4000, height: 200 };
        const offset = cameraOffset({ x: 2000, y: 100 }, viewport, wide);
        expect(2000 + offset.x).toBe(viewport.width / 2); // по X — следует
        expect(offset.y).toBe((viewport.height - wide.height) / 2); // по Y — центрирует
    });
});

describe('visibleChunkRange', () => {
    const chunkPx = 512;
    const chunks = { width: 32, height: 32 };

    it('в левом верхнем углу берёт только начальные чанки', () => {
        const range = visibleChunkRange({ x: 0, y: 0 }, viewport, chunkPx, chunks, 0);
        expect(range.x0).toBe(0);
        expect(range.y0).toBe(0);
        expect(range.x1).toBe(1); // 800px вьюпорта пересекают чанки 0 и 1
        expect(range.y1).toBe(1);
    });

    it('следует за смещением камеры', () => {
        const range = visibleChunkRange({ x: -5000, y: -3000 }, viewport, chunkPx, chunks, 0);
        expect(range.x0).toBe(Math.floor(5000 / chunkPx));
        expect(range.y0).toBe(Math.floor(3000 / chunkPx));
    });

    it('запас (margin) расширяет диапазон, но не вылезает за карту', () => {
        const withMargin = visibleChunkRange({ x: -5000, y: -3000 }, viewport, chunkPx, chunks, 2);
        const without = visibleChunkRange({ x: -5000, y: -3000 }, viewport, chunkPx, chunks, 0);
        expect(withMargin.x0).toBe(without.x0 - 2);
        expect(withMargin.x1).toBe(without.x1 + 2);

        const corner = visibleChunkRange({ x: 0, y: 0 }, viewport, chunkPx, chunks, 3);
        expect(corner.x0).toBe(0); // не уходит в минус
        expect(corner.y0).toBe(0);
    });

    it('не выходит за границы карты у дальнего края', () => {
        const far = visibleChunkRange({ x: -(chunks.width * chunkPx), y: -(chunks.height * chunkPx) }, viewport, chunkPx, chunks, 2);
        expect(far.x1).toBe(chunks.width - 1);
        expect(far.y1).toBe(chunks.height - 1);
    });

    it('chunkRangeContains проверяет попадание', () => {
        const range = { x0: 2, y0: 3, x1: 5, y1: 7 };
        expect(chunkRangeContains(range, 2, 3)).toBe(true);
        expect(chunkRangeContains(range, 5, 7)).toBe(true);
        expect(chunkRangeContains(range, 1, 5)).toBe(false);
        expect(chunkRangeContains(range, 3, 8)).toBe(false);
    });
});

describe('approach (сглаживание камеры)', () => {
    it('движется к цели и в итоге её достигает', () => {
        let value = 0;
        for (let i = 0; i < 200; i++) {
            value = approach(value, 100, 16);
        }
        expect(value).toBe(100);
    });

    it('никогда не перелетает цель', () => {
        let value = 0;
        for (let i = 0; i < 50; i++) {
            value = approach(value, 100, 16);
            expect(value).toBeLessThanOrEqual(100);
        }
    });

    it('большая дельта времени не ломает сходимость', () => {
        expect(approach(0, 100, 5000)).toBe(100);
    });

    it('работает в обе стороны', () => {
        expect(approach(100, 0, 16)).toBeLessThan(100);
        expect(approach(0, 100, 16)).toBeGreaterThan(0);
    });
});
