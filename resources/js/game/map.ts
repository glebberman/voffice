// Захардкоженная карта офиса. Каждый символ — тайл 32×32.
//
//  #  стена          D  рабочий стол     T  стол переговорки
//  .  пол            K  кухонная стойка  S  диван
//  :  плитка кухни   ,  ковёр переговорки
//  ;  ковёр лаунжа   P  растение

export const TILE = 32;

export const MAP_ROWS: string[] = [
    '#########################',
    '#.........#:::::#,,,,,,,#',
    '#.DDDD....#:KKK:#,,TTT,,#',
    '#.........#:::::#,,TTT,,#',
    '#.DDDD....#:::::#,,,,,,,#',
    '#.........###:###,,,,,,,#',
    '#...............####,####',
    '#..P.................P..#',
    '#.DDDD..................#',
    '#.......................#',
    '#.DDDD.......;;;;;;;;...#',
    '#............;;SSSS;;...#',
    '#............;;;;;;;;...#',
    '#............;;SSSS;;...#',
    '#...P........;;;;;;;;..P#',
    '#########################',
];

export const MAP_W = MAP_ROWS[0].length;
export const MAP_H = MAP_ROWS.length;

if (MAP_ROWS.some((row) => row.length !== MAP_W)) {
    throw new Error('Все строки карты должны быть одинаковой длины');
}

const WALKABLE = new Set(['.', ':', ',', ';']);

export function tileAt(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) {
        return '#';
    }
    return MAP_ROWS[y][x];
}

export function isWalkable(x: number, y: number): boolean {
    return WALKABLE.has(tileAt(x, y));
}

export const SPAWN = { x: 6, y: 8 };

export interface Zone {
    name: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    // приватная зона: чат слышен только внутри неё (и не слышен снаружи)
    isPrivate?: boolean;
}

export const ZONES: Zone[] = [
    { name: 'Кухня', x1: 11, y1: 1, x2: 15, y2: 5 },
    { name: 'Переговорка', x1: 17, y1: 1, x2: 23, y2: 6, isPrivate: true },
    { name: 'Лаунж', x1: 13, y1: 10, x2: 20, y2: 14 },
];

export function zoneAt(x: number, y: number): Zone | null {
    return ZONES.find((z) => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2) ?? null;
}

// Радиус текстового чата в тайлах (как proximity-чат в Gather)
export const CHAT_RADIUS = 4;

export function tilesBetween(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
}

// Слышит ли слушатель в (lx, ly) говорящего в (sx, sy): приватная зона
// отсекает всех снаружи (в обе стороны), иначе действует радиус.
export function canHear(lx: number, ly: number, sx: number, sy: number): boolean {
    const listenerZone = zoneAt(lx, ly);
    const senderZone = zoneAt(sx, sy);
    if (listenerZone?.isPrivate || senderZone?.isPrivate) {
        return listenerZone === senderZone;
    }
    return tilesBetween(lx, ly, sx, sy) <= CHAT_RADIUS;
}
