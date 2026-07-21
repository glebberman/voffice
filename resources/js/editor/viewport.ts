import type { Point } from '@/game/camera';
import { TILE } from '@/game/map';

/**
 * Ступени масштаба Pixi-поля редактора. Выбраны так, чтобы TILE*scale было
 * целым (8, 16, 24, 32, 48, 64, 96) — иначе между чанками-Graphics появлялись
 * бы полупиксельные швы.
 */
export const EDITOR_ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3] as const;

/** Индекс масштаба 1:1 — стартовый зум редактора. */
export const EDITOR_ZOOM_DEFAULT = 3;

/**
 * Тайл под экранной точкой (в координатах канваса) при данном смещении мира и
 * масштабе. Мир двигается смещением `camera` и масштабируется `scale`, поэтому
 * тайл = (экран − смещение) / (TILE·scale).
 */
export function screenToTile(screenX: number, screenY: number, camera: Point, scale: number): Point {
    return {
        x: Math.floor((screenX - camera.x) / (TILE * scale)),
        y: Math.floor((screenY - camera.y) / (TILE * scale)),
    };
}

/**
 * Новое смещение мира после смены масштаба так, чтобы мировая точка под
 * курсором осталась ровно под ним. Вывод: мировая точка `w = (cursor − camera)
 * / oldScale`; хотим `cursor = newCamera + w·newScale`.
 */
export function zoomToCursor(camera: Point, oldScale: number, newScale: number, cursorX: number, cursorY: number): Point {
    const wx = (cursorX - camera.x) / oldScale;
    const wy = (cursorY - camera.y) / oldScale;
    return { x: cursorX - wx * newScale, y: cursorY - wy * newScale };
}

/**
 * Держит мир в кадре: если он меньше вьюпорта по оси — центрирует, иначе не
 * даёт уехать за край (по образцу камеры игры, но без слежения за персонажем —
 * панорама свободная).
 */
export function clampOffset(offset: number, viewport: number, world: number): number {
    if (world <= viewport) {
        return (viewport - world) / 2;
    }
    return Math.min(0, Math.max(viewport - world, offset));
}
