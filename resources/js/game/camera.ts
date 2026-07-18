// Камера: какую часть мира показывать вокруг персонажа.
//
// Раньше канвас был размером со всю карту, и она целиком ужималась в контейнер.
// Теперь канвас — это окно (вьюпорт), а мир двигается под ним. Это снимает
// физический предел размера WebGL-канваса (~16384 px) и позволяет строить
// карты в сотни тайлов.

export interface Size {
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

// Размер чанка карты в тайлах: карта режется на квадраты, которые рисуются
// лениво и по одному, а не одним гигантским Graphics на всю карту.
export const CHUNK_TILES = 16;

/**
 * Смещение мира, чтобы точка `center` (пиксели мира) оказалась в центре
 * вьюпорта. Результат — координата, в которую надо поставить контейнер мира
 * (то есть уже со знаком минус относительно центра).
 *
 * Кламп по краям карты: за границей мира не должно быть видно пустоты.
 * Если карта меньше вьюпорта по оси — она центрируется по этой оси.
 */
export function cameraOffset(center: Point, viewport: Size, world: Size): Point {
    return {
        x: axisOffset(center.x, viewport.width, world.width),
        y: axisOffset(center.y, viewport.height, world.height),
    };
}

function axisOffset(center: number, viewport: number, world: number): number {
    if (world <= viewport) {
        // мир уже вьюпорта — центрируем его целиком
        return (viewport - world) / 2;
    }
    const raw = viewport / 2 - center;
    const min = viewport - world; // упёрлись в правый/нижний край
    const max = 0; // упёрлись в левый/верхний край
    return Math.min(max, Math.max(min, raw));
}

export interface ChunkRange {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/**
 * Диапазон чанков, попадающих во вьюпорт при данном смещении мира.
 * `margin` — сколько чанков захватить про запас за краями экрана, чтобы при
 * движении не было видно, как они появляются.
 */
export function visibleChunkRange(offset: Point, viewport: Size, chunkPx: number, chunks: Size, margin = 1): ChunkRange {
    // видимая область в координатах мира
    const left = -offset.x;
    const top = -offset.y;

    return {
        x0: clamp(Math.floor(left / chunkPx) - margin, 0, chunks.width - 1),
        y0: clamp(Math.floor(top / chunkPx) - margin, 0, chunks.height - 1),
        x1: clamp(Math.floor((left + viewport.width) / chunkPx) + margin, 0, chunks.width - 1),
        y1: clamp(Math.floor((top + viewport.height) / chunkPx) + margin, 0, chunks.height - 1),
    };
}

export function chunkRangeContains(range: ChunkRange, cx: number, cy: number): boolean {
    return cx >= range.x0 && cx <= range.x1 && cy >= range.y0 && cy <= range.y1;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Плавное приближение к цели: доля пути за кадр, независимая от FPS. */
export function approach(current: number, target: number, deltaMS: number, smoothing = 0.012): number {
    const t = 1 - Math.exp(-smoothing * deltaMS);
    const next = current + (target - current) * t;
    // добиваем последние доли пикселя, чтобы не дрожать бесконечно
    return Math.abs(target - next) < 0.05 ? target : next;
}
