// Карта комнаты приезжает с сервера (rooms.map, исходники в resources/maps/*.json).
// Каждый символ — тайл 32×32:
//
//  #  стена          D  рабочий стол     T  стол переговорки
//  .  пол            K  кухонная стойка  S  диван
//  :  плитка кухни   ,  ковёр переговорки
//  ;  ковёр лаунжа   P  растение

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

export interface MapData {
    rows: string[];
    spawn: { x: number; y: number };
    zones: Zone[];
    objects: MapObjectData[];
    portals: PortalData[];
}

const WALKABLE = new Set(['.', ':', ',', ';']);

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
    tileAt(x: number, y: number): string;
    isWalkable(x: number, y: number): boolean;
    zoneAt(x: number, y: number): Zone | null;
    canHear(lx: number, ly: number, sx: number, sy: number): boolean;
    resolveSpawn(stored: { x: number; y: number } | null | undefined): { x: number; y: number };
    portalAt(x: number, y: number): PortalData | null;
    nearestObject(x: number, y: number): MapObjectData | null;
}

export function makeMap(data: MapData): GameMap {
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

    const isWalkable = (x: number, y: number): boolean => WALKABLE.has(tileAt(x, y));

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
        tileAt,
        isWalkable,
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
