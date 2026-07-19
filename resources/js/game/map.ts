import type { PropCatalogue } from './props';

// Карта комнаты приезжает с сервера (rooms.map, исходники в resources/maps/*.json).
// Каждый символ — тайл 32×32:
//
//  #  стена          D  рабочий стол     T  стол переговорки
//  .  пол            K  кухонная стойка  S  диван
//  :  плитка кухни   ,  ковёр переговорки
//  ;  ковёр лаунжа   P  растение         *  spotlight (сцена)

export const TILE = 32;

// Радиус текстового чата в тайлах (как proximity-чат в Gather)
export const CHAT_RADIUS = 4;

// радиус, с которого можно взаимодействовать с объектом
export const OBJECT_RADIUS = 1.6;

export interface Zone {
    name: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    // приватная зона: чат слышен только внутри неё (и не слышен снаружи)
    isPrivate?: boolean;
}

export type MapObjectType = 'board' | 'video' | 'map' | 'link';

export interface MapObjectData {
    id: string;
    type: MapObjectType;
    label: string;
    url: string;
    x: number;
    y: number;
}

export interface PortalData {
    x: number;
    y: number;
    to: string; // slug целевой комнаты
    label: string;
    tx: number; // тайл прибытия
    ty: number;
}

/**
 * Предмет обстановки: занимает прямоугольник клеток (основание блокирует
 * проход), а его спрайт может быть выше основания — за высокой частью
 * персонаж проходит, и она рисуется поверх него. Размеры берутся из
 * каталога по `type`, поэтому в карте хранится только тип и позиция.
 */
export interface PropData {
    id: string;
    type: string;
    x: number; // левый верхний тайл ОСНОВАНИЯ
    y: number;
}

export interface MapData {
    rows: string[];
    spawn: { x: number; y: number };
    zones: Zone[];
    objects: MapObjectData[];
    portals: PortalData[];
    props?: PropData[];
}

const WALKABLE = new Set(['.', ':', ',', ';', '*']);

// список тайлов для палитры редактора карт
export const TILE_CHARS = ['.', '#', ':', ',', ';', 'D', 'K', 'T', 'S', 'P', '*'] as const;

// предел размера карты (совпадает с валидацией MapUpdateRequest)
export const MAX_MAP_SIZE = 512;

/** Обводит карту сплошной стеной по периметру — инвариант всех карт. */
export function sealPerimeter(rows: string[]): string[] {
    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    if (width === 0 || height === 0) {
        return rows;
    }
    return rows.map((row, y) => (y === 0 || y === height - 1 ? '#'.repeat(width) : '#' + row.slice(1, width - 1) + '#'));
}

/**
 * Меняет размер карты: обрезает лишнее или дополняет полом, после чего
 * восстанавливает стену по периметру. Используется редактором.
 */
export function resizeRows(rows: string[], width: number, height: number): string[] {
    const w = Math.max(3, Math.min(MAX_MAP_SIZE, Math.floor(width)));
    const h = Math.max(3, Math.min(MAX_MAP_SIZE, Math.floor(height)));

    const out: string[] = [];
    for (let y = 0; y < h; y++) {
        const src = rows[y] ?? '';
        let row = '';
        for (let x = 0; x < w; x++) {
            row += src[x] ?? '.';
        }
        out.push(row);
    }
    return sealPerimeter(out);
}

/** Заменяет один тайл, не копируя всю сетку (важно на больших картах). */
export function setTile(rows: string[], x: number, y: number, ch: string): string[] {
    if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length || rows[y][x] === ch) {
        return rows;
    }
    const next = rows.slice();
    next[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
    return next;
}

/** Заливает прямоугольник одним тайлом (инструмент «прямоугольник»). */
export function fillRect(rows: string[], x0: number, y0: number, x1: number, y1: number, ch: string): string[] {
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min((rows[0]?.length ?? 1) - 1, Math.max(x0, x1));
    const top = Math.max(0, Math.min(y0, y1));
    const bottom = Math.min(rows.length - 1, Math.max(y0, y1));

    const next = rows.slice();
    for (let y = top; y <= bottom; y++) {
        next[y] = next[y].slice(0, left) + ch.repeat(right - left + 1) + next[y].slice(right + 1);
    }
    return next;
}

export function tilesBetween(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
}

export interface GameMap {
    rows: string[];
    width: number;
    height: number;
    spawn: { x: number; y: number };
    zones: Zone[];
    objects: MapObjectData[];
    portals: PortalData[];
    props: PropData[];
    /** Каталог, которым разобраны props — сцене и редактору нужен тот же. */
    catalogue: PropCatalogue;
    tileAt(x: number, y: number): string;
    isWalkable(x: number, y: number): boolean;
    /** Верхушка стены: тайл над стеной, за которым можно пройти. */
    isWallCrown(x: number, y: number): boolean;
    isSpotlight(x: number, y: number): boolean;
    zoneAt(x: number, y: number): Zone | null;
    canHear(lx: number, ly: number, sx: number, sy: number): boolean;
    resolveSpawn(stored: { x: number; y: number } | null | undefined): { x: number; y: number };
    portalAt(x: number, y: number): PortalData | null;
    nearestObject(x: number, y: number): MapObjectData | null;
}

/**
 * Каталог предметов передаётся явно: он живёт в БД и правится из браузера,
 * поэтому «зашить» его в модуль нельзя. Пустой каталог = предметы неизвестны
 * и проход не блокируют (так работают тесты, которым предметы не нужны).
 */
export function makeMap(data: MapData, catalogue: PropCatalogue = {}): GameMap {
    const rows = data.rows;
    const width = rows[0]?.length ?? 0;
    const height = rows.length;

    if (rows.some((row) => row.length !== width)) {
        throw new Error('Все строки карты должны быть одинаковой длины');
    }

    const tileAt = (x: number, y: number): string => {
        if (x < 0 || y < 0 || x >= width || y >= height) {
            return '#';
        }
        return rows[y][x];
    };

    // клетки, занятые основаниями предметов (высокая часть остаётся проходимой)
    const props = data.props ?? [];
    const blocked = new Set<number>();
    for (const prop of props) {
        const spec = catalogue[prop.type];
        if (!spec) {
            continue;
        }
        for (let dy = 0; dy < spec.h; dy++) {
            for (let dx = 0; dx < spec.w; dx++) {
                blocked.add((prop.y + dy) * width + prop.x + dx);
            }
        }
    }

    const isWalkable = (x: number, y: number): boolean => WALKABLE.has(tileAt(x, y)) && !blocked.has(y * width + x);

    // стена рисуется в два тайла: над ней «верхушка», за которой можно ходить
    const isWallCrown = (x: number, y: number): boolean => tileAt(x, y) !== '#' && tileAt(x, y + 1) === '#';

    const isSpotlight = (x: number, y: number): boolean => tileAt(x, y) === '*';

    const zoneAt = (x: number, y: number): Zone | null => data.zones.find((z) => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2) ?? null;

    // Слышит ли слушатель в (lx, ly) говорящего в (sx, sy): приватная зона
    // отсекает всех снаружи (в обе стороны), иначе действует радиус.
    const canHear = (lx: number, ly: number, sx: number, sy: number): boolean => {
        const listenerZone = zoneAt(lx, ly);
        const senderZone = zoneAt(sx, sy);
        if (listenerZone?.isPrivate || senderZone?.isPrivate) {
            return listenerZone === senderZone;
        }
        return tilesBetween(lx, ly, sx, sy) <= CHAT_RADIUS;
    };

    return {
        rows,
        width,
        height,
        spawn: data.spawn,
        zones: data.zones,
        objects: data.objects,
        portals: data.portals,
        props,
        catalogue,
        tileAt,
        isWalkable,
        isWallCrown,
        isSpotlight,
        zoneAt,
        canHear,
        // сохранённая позиция может устареть (карта изменилась) — проверяем проходимость
        resolveSpawn: (stored) => (stored && isWalkable(stored.x, stored.y) ? stored : data.spawn),
        portalAt: (x, y) => data.portals.find((p) => p.x === x && p.y === y) ?? null,
        nearestObject: (x, y) => {
            let best: MapObjectData | null = null;
            let bestDist = OBJECT_RADIUS;
            for (const obj of data.objects) {
                const dist = tilesBetween(x, y, obj.x, obj.y);
                if (dist <= bestDist) {
                    best = obj;
                    bestDist = dist;
                }
            }
            return best;
        },
    };
}
