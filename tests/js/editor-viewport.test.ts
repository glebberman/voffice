import { clampOffset, EDITOR_ZOOMS, screenToTile, zoomToCursor } from '@/editor/viewport';
import { TILE } from '@/game/map';
import { describe, expect, it } from 'vitest';

describe('ступени зума', () => {
    it('содержат 1:1 и дают целое число пикселей на тайл', () => {
        expect(EDITOR_ZOOMS).toContain(1);
        for (const z of EDITOR_ZOOMS) {
            expect(Number.isInteger(TILE * z), `${z}`).toBe(true);
        }
    });
});

describe('экран → тайл', () => {
    it('без смещения и масштаба делит по размеру тайла', () => {
        expect(screenToTile(0, 0, { x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
        expect(screenToTile(TILE + 4, 2 * TILE, { x: 0, y: 0 }, 1)).toEqual({ x: 1, y: 2 });
    });

    it('учитывает смещение мира', () => {
        // мир сдвинут на −100 по x: экранная 100 попадает в тайл 0
        expect(screenToTile(100, 0, { x: -100, y: 0 }, 1)).toEqual({ x: 6, y: 0 }); // (100+100)/32=6.25
        expect(screenToTile(100, 0, { x: 100, y: 0 }, 1)).toEqual({ x: 0, y: 0 }); // (100−100)/32=0
    });

    it('учитывает масштаб', () => {
        // при zoom 2 тайл на экране занимает 64 px
        expect(screenToTile(64, 64, { x: 0, y: 0 }, 2)).toEqual({ x: 1, y: 1 });
        expect(screenToTile(63, 0, { x: 0, y: 0 }, 2)).toEqual({ x: 0, y: 0 });
    });
});

describe('зум к курсору', () => {
    it('оставляет мировую точку под курсором на месте', () => {
        const camera = { x: -40, y: -80 };
        const cursor = { x: 200, y: 150 };
        const before = { x: (cursor.x - camera.x) / 2, y: (cursor.y - camera.y) / 2 };

        const next = zoomToCursor(camera, 2, 3, cursor.x, cursor.y);
        const after = { x: (cursor.x - next.x) / 3, y: (cursor.y - next.y) / 3 };

        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
    });
});

describe('зажим смещения', () => {
    it('центрирует мир меньше вьюпорта', () => {
        expect(clampOffset(999, 800, 300)).toBe(250); // (800−300)/2
        expect(clampOffset(-999, 800, 300)).toBe(250);
    });

    it('не даёт уехать за край мира крупнее вьюпорта', () => {
        expect(clampOffset(50, 800, 2000)).toBe(0); // левый край
        expect(clampOffset(-5000, 800, 2000)).toBe(-1200); // правый край: viewport−world
        expect(clampOffset(-400, 800, 2000)).toBe(-400); // внутри диапазона — без изменений
    });
});
