import catalogue from '../../props.json';

// Каталог предметов живёт в resources/props.json — тот же файл читает
// MapUpdateRequest для whitelist-валидации типов.
// Размер тайла берём из каталога, а не из map.ts: иначе получится
// циклический импорт (map.ts нужен каталог для расчёта проходимости).
const TILE = catalogue.tileSize;

export interface PropSpec {
    label: string;
    sheet: string; // путь внутри public/assets/lpc
    sx: number; // левый верхний угол региона в спрайтшите
    sy: number;
    w: number; // ширина основания в тайлах (блокирует проход)
    h: number; // высота основания в тайлах (блокирует проход)
    tall: number; // тайлов спрайта НАД основанием — за ними можно проходить
}

export const PROP_SPECS = catalogue.items as Record<string, PropSpec>;
export const PROP_TYPES = Object.keys(PROP_SPECS);

const ASSET_BASE = '/assets/lpc';

export function propSpec(type: string): PropSpec | null {
    return PROP_SPECS[type] ?? null;
}

export function propSheetUrl(spec: PropSpec): string {
    return `${ASSET_BASE}/${spec.sheet}`;
}

/** Полный регион спрайта: основание + высокая часть. */
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
export function propFootprint(prop: { type: string; x: number; y: number }): { x: number; y: number }[] {
    const spec = propSpec(prop.type);
    if (!spec) {
        return [];
    }
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < spec.h; dy++) {
        for (let dx = 0; dx < spec.w; dx++) {
            cells.push({ x: prop.x + dx, y: prop.y + dy });
        }
    }
    return cells;
}
