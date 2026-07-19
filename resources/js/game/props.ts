import { TILE } from './map';

// Каталог предметов приходит с сервера (таблица prop_types, стартовое
// наполнение — resources/props.json). Клиент его не хранит и не импортирует:
// размеры предмета меняются из браузера, и «зашитая» копия разъехалась бы с
// тем, по чему валидирует карту сервер.

export interface PropSpec {
    label: string;
    sheet: string; // путь внутри public/assets/lpc
    sx: number; // левый верхний угол региона в спрайтшите
    sy: number;
    w: number; // ширина основания в тайлах (блокирует проход)
    h: number; // высота основания в тайлах (блокирует проход)
    tall: number; // тайлов спрайта НАД основанием — за ними можно проходить
}

// Значение может отсутствовать: тип предмета приходит из карты, а карту могли
// сохранить до того, как тип удалили из каталога.
export type PropCatalogue = Partial<Record<string, PropSpec>>;

const ASSET_BASE = '/assets/lpc';

export function propSpec(catalogue: PropCatalogue, type: string): PropSpec | null {
    return catalogue[type] ?? null;
}

export function propSheetUrl(spec: Pick<PropSpec, 'sheet'>): string {
    return `${ASSET_BASE}/${spec.sheet}`;
}

/** Полный регион спрайта: основание + часть, висящая в воздухе. */
export function propSpriteRect(spec: PropSpec): { x: number; y: number; width: number; height: number } {
    return {
        x: spec.sx,
        y: spec.sy,
        width: spec.w * TILE,
        height: (spec.h + spec.tall) * TILE,
    };
}

/** Верхняя (проходимая) часть спрайта — рисуется НАД игроками. */
export function propTallRect(spec: PropSpec): { x: number; y: number; width: number; height: number } | null {
    if (spec.tall <= 0) {
        return null;
    }
    return { x: spec.sx, y: spec.sy, width: spec.w * TILE, height: spec.tall * TILE };
}

/** Нижняя часть спрайта (основание) — рисуется ПОД игроками. */
export function propBaseRect(spec: PropSpec): { x: number; y: number; width: number; height: number } {
    return {
        x: spec.sx,
        y: spec.sy + spec.tall * TILE,
        width: spec.w * TILE,
        height: spec.h * TILE,
    };
}

/** Клетки, которые предмет занимает и делает непроходимыми. */
export function propFootprint(spec: PropSpec, prop: { x: number; y: number }): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < spec.h; dy++) {
        for (let dx = 0; dx < spec.w; dx++) {
            cells.push({ x: prop.x + dx, y: prop.y + dy });
        }
    }
    return cells;
}

/**
 * Помещается ли предмет: основание внутри карты, а части «в воздухе» хватает
 * места сверху. Ту же проверку повторяет сервер (MapUpdateRequest).
 */
export function propFits(spec: PropSpec, x: number, y: number, width: number, height: number): boolean {
    return x >= 0 && y - spec.tall >= 0 && x + spec.w <= width && y + spec.h <= height;
}
