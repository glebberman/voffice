import { TILE } from './map';

// Каталог предметов приходит с сервера (таблицы prop_types/prop_orientations,
// стартовое наполнение — resources/props.json). Клиент его не хранит и не
// импортирует: размеры предмета меняются из браузера, и «зашитая» копия
// разъехалась бы с тем, по чему валидирует карту сервер.

/** Стороны, которыми может стоять предмет; south — канон LPC (лицом к камере). */
export const PROP_DIRS = ['south', 'west', 'east', 'north'] as const;

export type PropDir = (typeof PROP_DIRS)[number];

export const PROP_DIR_LABEL: Record<PropDir, string> = {
    south: 'к камере',
    west: 'влево',
    east: 'вправо',
    north: 'от камеры',
};

/** Регион состояния: свой лист и угол, размер — w×(h+tall) своей ориентации. */
export interface PropStateRegion {
    sheet: string;
    sx: number;
    sy: number;
}

/**
 * Одна сторона предмета: свой регион на листе и своя геометрия — у повёрнутого
 * предмета меняется не только картинка, но и footprint (стол 4×1 → 1×2).
 */
export interface PropOrientation {
    sheet: string; // путь внутри public/assets/lpc
    sx: number; // левый верхний угол региона в спрайтшите
    sy: number;
    w: number; // ширина основания в тайлах (блокирует проход)
    h: number; // высота основания в тайлах (блокирует проход)
    tall: number; // тайлов спрайта НАД основанием — за ними можно проходить
    // имена общие для всех сторон типа; отсутствие поля = состояний нет
    // (props.json пустые состояния не пишет, сервер присылает всегда)
    states?: Partial<Record<string, PropStateRegion>>;
}

export interface PropSpec {
    label: string;
    description?: string; // текст карточки каталога
    defaultState?: string | null; // что рисуется, пока предметом не пользуются
    purposes?: string[]; // слоги категорий оси «назначение»
    roomKinds?: string[]; // слоги категорий оси «тип помещения»
    orientations: Partial<Record<PropDir, PropOrientation>>;
}

// Значение может отсутствовать: тип предмета приходит из карты, а карту могли
// сохранить до того, как тип удалили из каталога.
export type PropCatalogue = Partial<Record<string, PropSpec>>;

const ASSET_BASE = '/assets/lpc';

export function propSpec(catalogue: PropCatalogue, type: string): PropSpec | null {
    return catalogue[type] ?? null;
}

/**
 * Ориентация предмета с фолбэком: запрошенная сторона → south → первая
 * попавшаяся. Ту же логику повторяет сервер (MapUpdateRequest::orientationOf),
 * поэтому карта с осиротевшим dir рисуется и валидируется одинаково.
 */
export function propOrientation(spec: PropSpec, dir?: PropDir): PropOrientation | null {
    const exact = dir ? spec.orientations[dir] : undefined;
    if (exact) {
        return exact;
    }
    if (spec.orientations.south) {
        return spec.orientations.south;
    }
    for (const fallback of PROP_DIRS) {
        const orientation = spec.orientations[fallback];
        if (orientation) {
            return orientation;
        }
    }
    return null;
}

/** Стороны, которыми предмет действительно может стоять, в каноническом порядке. */
export function propDirs(spec: PropSpec): PropDir[] {
    return PROP_DIRS.filter((dir) => spec.orientations[dir] !== undefined);
}

/**
 * Следующая сторона в цикле доступных ориентаций типа (по нажатию R). Если у
 * типа одна сторона — возвращает её же; неизвестную текущую считает началом.
 */
export function nextPropDir(spec: PropSpec, dir: PropDir | undefined): PropDir {
    const dirs = propDirs(spec);
    if (dirs.length === 0) {
        return dir ?? 'south';
    }
    const i = dirs.indexOf(dir ?? 'south');
    return dirs[(i + 1) % dirs.length];
}

/**
 * Индекс верхнего (нарисованного последним) предмета, чьё основание накрывает
 * клетку (x,y), или null. Нужен редактору для выделения предмета кликом по полю.
 */
export function propAt(
    catalogue: PropCatalogue,
    props: readonly { type: string; x: number; y: number; dir?: PropDir }[],
    x: number,
    y: number,
): number | null {
    for (let i = props.length - 1; i >= 0; i--) {
        const prop = props[i];
        const spec = propSpec(catalogue, prop.type);
        const orientation = spec ? propOrientation(spec, prop.dir) : null;
        if (orientation && x >= prop.x && x < prop.x + orientation.w && y >= prop.y && y < prop.y + orientation.h) {
            return i;
        }
    }
    return null;
}

/**
 * Ориентация в заданном состоянии: регион берётся у состояния, геометрия — у
 * ориентации. Неизвестное состояние (карту сохранили до правки каталога) или
 * null возвращают ориентацию как есть — рисуется базовый регион.
 */
export function withState(orientation: PropOrientation, state: string | null | undefined): PropOrientation {
    const region = state != null ? orientation.states?.[state] : undefined;

    return region ? { ...orientation, ...region } : orientation;
}

export function propSheetUrl(orientation: Pick<PropOrientation, 'sheet'>): string {
    return `${ASSET_BASE}/${orientation.sheet}`;
}

/** Полный регион спрайта: основание + часть, висящая в воздухе. */
export function propSpriteRect(orientation: PropOrientation): { x: number; y: number; width: number; height: number } {
    return {
        x: orientation.sx,
        y: orientation.sy,
        width: orientation.w * TILE,
        height: (orientation.h + orientation.tall) * TILE,
    };
}

/** Верхняя (проходимая) часть спрайта — рисуется НАД игроками. */
export function propTallRect(orientation: PropOrientation): { x: number; y: number; width: number; height: number } | null {
    if (orientation.tall <= 0) {
        return null;
    }
    return { x: orientation.sx, y: orientation.sy, width: orientation.w * TILE, height: orientation.tall * TILE };
}

/** Нижняя часть спрайта (основание) — рисуется ПОД игроками. */
export function propBaseRect(orientation: PropOrientation): { x: number; y: number; width: number; height: number } {
    return {
        x: orientation.sx,
        y: orientation.sy + orientation.tall * TILE,
        width: orientation.w * TILE,
        height: orientation.h * TILE,
    };
}

/** Клетки, которые предмет занимает и делает непроходимыми. */
export function propFootprint(orientation: PropOrientation, prop: { x: number; y: number }): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < orientation.h; dy++) {
        for (let dx = 0; dx < orientation.w; dx++) {
            cells.push({ x: prop.x + dx, y: prop.y + dy });
        }
    }
    return cells;
}

/**
 * Помещается ли предмет: основание внутри карты, а части «в воздухе» хватает
 * места сверху. Ту же проверку повторяет сервер (MapUpdateRequest).
 */
export function propFits(orientation: PropOrientation, x: number, y: number, width: number, height: number): boolean {
    return x >= 0 && y - orientation.tall >= 0 && x + orientation.w <= width && y + orientation.h <= height;
}
