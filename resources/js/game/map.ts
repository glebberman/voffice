import { propInteractionCells, propOrientation, type PropCatalogue, type PropDir, type PropOrientation, type PropSpec } from './props';

// Карта комнаты приезжает с сервера (rooms.map, исходники в resources/maps/*.json).
// Каждый символ — тайл 32×32. Мебель — это предметы каталога (props), пол под
// ними красится по зоне:
//
//  #  стена          :  плитка кухни     ,  ковёр переговорки
//  .  пол            ;  ковёр лаунжа     *  spotlight (сцена)

export const TILE = 32;

// Радиус текстового чата в тайлах (как proximity-чат в Gather)
export const CHAT_RADIUS = 4;

export interface Zone {
    name: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    // приватная зона: чат слышен только внутри неё (и не слышен снаружи)
    isPrivate?: boolean;
    // тип помещения (переговорка/кухня/…) — задел под стили; игра пока
    // игнорирует, редактор красит зону цветом пресета. Отсутствие = «своя».
    kind?: string;
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
 * каталога по `type` и стороне `dir`, поэтому в карте хранится только тип,
 * позиция и поворот.
 */
export interface PropData {
    id: string;
    type: string;
    x: number; // левый верхний тайл ОСНОВАНИЯ
    y: number;
    dir?: PropDir; // сторона, которой стоит предмет; отсутствие означает south
    // настройки поведения инстанса (embed → {label, url}); нет = не настроен.
    // Форму на веру не берём — разбирают parse-функции из game/behaviors.ts
    settings?: Record<string, string>;
}

/** Сторона двери: с неё запирают и отпирают. */
export type LockSide = 'north' | 'south' | 'west' | 'east';

export const LOCK_SIDES: LockSide[] = ['north', 'south', 'west', 'east'];

export const LOCK_SIDE_LABEL: Record<LockSide, string> = {
    north: 'сверху',
    south: 'снизу',
    west: 'слева',
    east: 'справа',
};

const LOCK_SIDE_STEP: Record<LockSide, { dx: number; dy: number }> = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    west: { dx: -1, dy: 0 },
    east: { dx: 1, dy: 0 },
};

/**
 * Дверь стоит на проходимом тайле (обычно в проёме стены). Закрытая не
 * пропускает, запертую нельзя открыть, пока её не отопрут со стороны замка.
 * В карте живёт только описание двери — открыта она сейчас или нет, хранится
 * отдельно (таблица door_states), потому что это состояние игры, а не карты.
 */
export interface DoorData {
    id: string;
    x: number;
    y: number;
    lock: LockSide | null; // null — замка нет, запереть нельзя
}

/** Состояние двери в рантайме: приезжает с сервера и меняется в эфире. */
export interface DoorState {
    closed: boolean;
    locked: boolean;
}

export interface MapData {
    rows: string[];
    spawn: { x: number; y: number };
    zones: Zone[];
    portals: PortalData[];
    props?: PropData[];
    doors?: DoorData[];
}

const WALKABLE = new Set(['.', ':', ',', ';', '*']);

/** Проходим ли сам тайл — без учёта предметов и дверей поверх него. */
export function isWalkableChar(ch: string): boolean {
    return WALKABLE.has(ch);
}

// список тайлов для палитры редактора карт
export const TILE_CHARS = ['.', '#', ':', ',', ';', '*'] as const;

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

/**
 * Интерактивный предмет под клеткой зоны: сам предмет, его спека (там поведение)
 * и абсолютные клетки зоны — для подсказки и подсветки в игре.
 */
export interface InteractionTarget {
    prop: PropData;
    spec: PropSpec;
    cells: { x: number; y: number }[];
}

export interface GameMap {
    rows: string[];
    width: number;
    height: number;
    spawn: { x: number; y: number };
    zones: Zone[];
    portals: PortalData[];
    props: PropData[];
    doors: DoorData[];
    /** Каталог, которым разобраны props — сцене и редактору нужен тот же. */
    catalogue: PropCatalogue;
    tileAt(x: number, y: number): string;
    isWalkable(x: number, y: number): boolean;
    /** Верхушка стены: тайл над стеной, за которым можно пройти. */
    isWallCrown(x: number, y: number): boolean;
    /** Накрыта ли клетка тем, что рисуется поверх игроков. */
    isOverhead(x: number, y: number): boolean;
    doorAt(x: number, y: number): DoorData | null;
    doorState(id: string): DoorState;
    /** Меняет состояние двери — карта перестаёт пускать через закрытую. */
    setDoorState(id: string, state: DoorState): void;
    /** Стоит ли игрок с той стороны двери, где висит замок. */
    onLockSide(door: DoorData, x: number, y: number): boolean;
    /**
     * Клетки, видимые из точки: всё, куда можно дойти, плюс сами закрытые
     * двери (их видно со своей стороны, а что за ними — уже нет).
     */
    reachableFrom(x: number, y: number): Set<number>;
    isSpotlight(x: number, y: number): boolean;
    zoneAt(x: number, y: number): Zone | null;
    canHear(lx: number, ly: number, sx: number, sy: number): boolean;
    resolveSpawn(stored: { x: number; y: number } | null | undefined): { x: number; y: number };
    portalAt(x: number, y: number): PortalData | null;
    /** Интерактивный предмет, в зоне которого стоит клетка (x,y), или null. */
    interactableAt(x: number, y: number): InteractionTarget | null;
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

    // ориентация предмета: спека по типу, затем сторона с фолбэком на south
    const orientationFor = (prop: PropData): PropOrientation | null => {
        const spec = catalogue[prop.type];
        return spec ? propOrientation(spec, prop.dir) : null;
    };

    // клетки, занятые основаниями предметов (высокая часть остаётся проходимой)
    const props = data.props ?? [];
    const blocked = new Set<number>();
    for (const prop of props) {
        const orientation = orientationFor(prop);
        if (!orientation) {
            continue;
        }
        for (let dy = 0; dy < orientation.h; dy++) {
            for (let dx = 0; dx < orientation.w; dx++) {
                blocked.add((prop.y + dy) * width + prop.x + dx);
            }
        }
    }

    // Индекс зон взаимодействия: клетка → интерактивный предмет. Только у
    // предметов с поведением и непустой зоной; клетки зоны берём у ориентации.
    // При наложении зон выигрывает последний (нарисован поверх, как propAt).
    const interactables = new Map<number, InteractionTarget>();
    for (const prop of props) {
        const spec = catalogue[prop.type];
        const orientation = orientationFor(prop);
        if (!spec?.behavior || !orientation) {
            continue;
        }
        const cells = propInteractionCells(orientation, prop);
        if (cells.length === 0) {
            continue;
        }
        const target: InteractionTarget = { prop, spec, cells };
        for (const cell of cells) {
            if (cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height) {
                interactables.set(cell.y * width + cell.x, target);
            }
        }
    }
    const interactableAt = (x: number, y: number): InteractionTarget | null => interactables.get(y * width + x) ?? null;

    // Двери: описание берём из карты, а состояние (открыта/заперта) живёт
    // отдельно и меняется в рантайме — поэтому здесь оно мутабельное.
    const doors = data.doors ?? [];
    const doorByTile = new Map<number, DoorData>();
    const doorStates = new Map<string, DoorState>();
    for (const door of doors) {
        doorByTile.set(door.y * width + door.x, door);
        doorStates.set(door.id, { closed: false, locked: false });
    }

    const doorAt = (x: number, y: number): DoorData | null => doorByTile.get(y * width + x) ?? null;
    const doorState = (id: string): DoorState => doorStates.get(id) ?? { closed: false, locked: false };
    const setDoorState = (id: string, state: DoorState): void => {
        if (doorStates.has(id)) {
            doorStates.set(id, state);
        }
    };

    const onLockSide = (door: DoorData, x: number, y: number): boolean => {
        if (!door.lock) {
            return false;
        }
        const step = LOCK_SIDE_STEP[door.lock];

        return x === door.x + step.dx && y === door.y + step.dy;
    };

    const isWalkable = (x: number, y: number): boolean => {
        if (!WALKABLE.has(tileAt(x, y)) || blocked.has(y * width + x)) {
            return false;
        }
        const door = doorAt(x, y);

        return !door || !doorState(door.id).closed;
    };

    /**
     * Обход в ширину по проходимым клеткам с захватом их границы.
     *
     * В набор попадают не только клетки, где можно стоять, но и всё, что к ним
     * примыкает: своя мебель, свои стены, закрытая дверь. Идти дальше от них
     * нельзя — поэтому за стеной и за закрытой дверью обход не продолжается.
     *
     * Без границы затемнялся бы каждый непроходимый тайл, включая столы и
     * диваны в той самой комнате, где персонаж стоит.
     */
    const reachableFrom = (x: number, y: number): Set<number> => {
        const seen = new Set<number>();
        if (x < 0 || y < 0 || x >= width || y >= height) {
            return seen;
        }

        const queue = [y * width + x];
        seen.add(queue[0]);
        // очередь растёт по ходу обхода, поэтому идём указателем, а не for-of
        let head = 0;
        while (head < queue.length) {
            const cell = queue[head++];
            const cx = cell % width;
            const cy = (cell - cx) / width;
            if (!isWalkable(cx, cy) && cell !== queue[0]) {
                continue; // закрытая дверь: видно её саму, но не то, что за ней
            }
            for (const [dx, dy] of [
                [0, -1],
                [0, 1],
                [-1, 0],
                [1, 0],
            ]) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
                    continue;
                }
                const next = ny * width + nx;
                if (seen.has(next)) {
                    continue;
                }
                seen.add(next);
                queue.push(next); // непроходимые попадут в набор, но из очереди не раскроются
            }
        }

        return seen;
    };

    // стена рисуется в два тайла: над ней «верхушка», за которой можно ходить
    const isWallCrown = (x: number, y: number): boolean => tileAt(x, y) !== '#' && tileAt(x, y + 1) === '#';

    // Клетки, накрытые тем, что рисуется ПОВЕРХ игроков: верхушками стен и
    // частями предметов, висящими в воздухе. Стоя на такой клетке, персонаж
    // скрыт — только тогда и нужен овал прозрачности.
    const overhead = new Set<number>();
    for (const prop of props) {
        const orientation = orientationFor(prop);
        if (!orientation) {
            continue;
        }
        for (let dy = 1; dy <= orientation.tall; dy++) {
            for (let dx = 0; dx < orientation.w; dx++) {
                overhead.add((prop.y - dy) * width + prop.x + dx);
            }
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isWallCrown(x, y)) {
                overhead.add(y * width + x);
            }
        }
    }

    const isOverhead = (x: number, y: number): boolean => overhead.has(y * width + x);

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
        portals: data.portals,
        props,
        doors,
        catalogue,
        tileAt,
        isWalkable,
        isWallCrown,
        isOverhead,
        doorAt,
        doorState,
        setDoorState,
        onLockSide,
        reachableFrom,
        isSpotlight,
        zoneAt,
        canHear,
        // сохранённая позиция может устареть (карта изменилась) — проверяем проходимость
        resolveSpawn: (stored) => (stored && isWalkable(stored.x, stored.y) ? stored : data.spawn),
        portalAt: (x, y) => data.portals.find((p) => p.x === x && p.y === y) ?? null,
        interactableAt,
    };
}
