import { isWalkableChar, type PropData } from '@/game/map';
import { propFits, propInteractionCells, propOrientation, type PropCatalogue, type PropDir, type PropOrientation } from '@/game/props';

// «Есть ли куда встать» — семантика из Sims: интерактивный предмет бесполезен,
// если к его зоне не подойти. Правила чистые и без Pixi, поэтому проверяются
// тестами, а редактор только рисует вердикт.

/** Всё, что мешает предмету встать в клетку, кроме него самого. */
export interface PlacementContext {
    width: number;
    height: number;
    spawn: { x: number; y: number };
    doors: readonly { x: number; y: number }[];
    /** Порталы: предмет поверх портала сделал бы его недостижимым. */
    portals: readonly { x: number; y: number }[];
    /** Клетки чужих оснований (blockedByProps с exceptId переносимого). */
    occupied: ReadonlySet<number>;
}

/**
 * Можно ли поставить предмет сюда — те же правила, что проверяет сервер
 * (`MapUpdateRequest`): основание целиком в границах, высокой части хватает
 * места сверху, и основание не накрывает ни точку спавна (игрок появился бы
 * внутри мебели), ни дверь (её было бы не открыть), ни портал (стал бы
 * недостижим), ни чужой предмет.
 *
 * Клиенту это нужно, чтобы призрак краснел сразу: без проверки предмет молча
 * вставал, а карта переставала сохраняться — и узнавали об этом через десять
 * минут правок.
 */
export function canPlace(orientation: PropOrientation, x: number, y: number, ctx: PlacementContext): boolean {
    if (!propFits(orientation, x, y, ctx.width, ctx.height)) {
        return false;
    }

    for (let dy = 0; dy < orientation.h; dy++) {
        for (let dx = 0; dx < orientation.w; dx++) {
            const cx = x + dx;
            const cy = y + dy;
            if (cx === ctx.spawn.x && cy === ctx.spawn.y) {
                return false;
            }
            if (ctx.occupied.has(cy * ctx.width + cx)) {
                return false;
            }
            if (ctx.doors.some((d) => d.x === cx && d.y === cy)) {
                return false;
            }
            if (ctx.portals.some((p) => p.x === cx && p.y === cy)) {
                return false;
            }
        }
    }

    return true;
}

/** Клетка зоны с вердиктом: можно ли на неё встать. */
export interface ZoneCell {
    x: number;
    y: number;
    ok: boolean;
}

/**
 * Клетки, занятые основаниями предметов. `exceptId` — предмет, который сейчас
 * тащат: его прежнее место не должно мешать ему же на новом.
 */
export function blockedByProps(catalogue: PropCatalogue, props: PropData[], width: number, exceptId?: string): Set<number> {
    const blocked = new Set<number>();
    for (const prop of props) {
        if (prop.id === exceptId) {
            continue;
        }
        for (const cell of footprintCells(catalogue, prop)) {
            blocked.add(cell.y * width + cell.x);
        }
    }

    return blocked;
}

/**
 * Клетки основания предмета. Отдельно от blockedByProps, потому что то же самое
 * нужно и «будущему» месту предмета на курсоре: он перекроет проход, встав туда.
 * Осиротевший тип не занимает ничего — как и в игре.
 */
export function footprintCells(catalogue: PropCatalogue, prop: { type: string; x: number; y: number; dir?: PropDir }): { x: number; y: number }[] {
    const spec = catalogue[prop.type];
    const orientation = spec ? propOrientation(spec, prop.dir) : null;
    if (!orientation) {
        return [];
    }

    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < orientation.h; dy++) {
        for (let dx = 0; dx < orientation.w; dx++) {
            cells.push({ x: prop.x + dx, y: prop.y + dy });
        }
    }

    return cells;
}

/**
 * Клетки, до которых персонаж дойдёт от спавна: обход в ширину по проходимым и
 * не занятым предметами клеткам.
 *
 * Двери считаем открытыми: закрыта дверь или заперта — состояние игры
 * (`door_states`), в карте его нет, и редактор про него знать не может.
 */
export function reachableFromSpawn(rows: string[], blocked: ReadonlySet<number>, spawn: { x: number; y: number }): Set<number> {
    const width = rows[0]?.length ?? 0;
    const height = rows.length;
    const seen = new Set<number>();

    const open = (x: number, y: number): boolean =>
        x >= 0 && y >= 0 && x < width && y < height && isWalkableChar(rows[y][x]) && !blocked.has(y * width + x);

    if (!open(spawn.x, spawn.y)) {
        return seen; // спавн на стене или под предметом — дойти неоткуда
    }

    const queue = [spawn.y * width + spawn.x];
    seen.add(queue[0]);
    let head = 0;
    while (head < queue.length) {
        const cell = queue[head++];
        const cx = cell % width;
        const cy = (cell - cx) / width;
        for (const [dx, dy] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
        ]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (!open(nx, ny)) {
                continue;
            }
            const next = ny * width + nx;
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }

    return seen;
}

/**
 * Достижимость после того, как предмет займёт клетки `removed`.
 *
 * Обход идёт только по уже достижимым клеткам, поэтому он заметно дешевле
 * полного: стены, чужие основания и всё отрезанное в него не попадают, а
 * проверка — это поиск в множестве, а не разбор символа тайла. Считается один
 * раз на положение предмета и переиспользуется всеми клетками зоны и всеми
 * значками «недоступен».
 */
export function reachableWithout(
    reachable: ReadonlySet<number>,
    removed: ReadonlySet<number>,
    width: number,
    spawn: { x: number; y: number },
): Set<number> {
    const seen = new Set<number>();
    const start = spawn.y * width + spawn.x;
    if (!reachable.has(start) || removed.has(start)) {
        return seen; // спавн замуровали тем же предметом — дойти неоткуда
    }

    const queue = [start];
    seen.add(start);
    let head = 0;
    while (head < queue.length) {
        const cell = queue[head++];
        const cx = cell % width;
        const cy = (cell - cx) / width;
        for (const [dx, dy] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
        ]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width) {
                continue;
            }
            const next = ny * width + nx;
            if (!seen.has(next) && reachable.has(next) && !removed.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }

    return seen;
}

/**
 * Вердикт по клеткам зоны. Достижимость уже включает в себя проходимость тайла
 * и чужие основания, а вот границы проверяем отдельно: индекс `y*width + x` за
 * краем строки завернулся бы на соседнюю и соврал — типичная зона `dx: +1` у
 * предмета на правом краю попала бы на начало следующей строки. Границы по y
 * при этом дают индекс заведомо вне множества, но проверяются наравне с x:
 * условие целиком читается, а не выводится из свойств нумерации.
 */
export function zoneAvailability(cells: { x: number; y: number }[], reachable: ReadonlySet<number>, width: number, height: number): ZoneCell[] {
    return cells.map((cell) => ({
        ...cell,
        ok: cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height && reachable.has(cell.y * width + cell.x),
    }));
}

/** Предмет доступен, если есть хотя бы одна клетка, куда встать. */
export function hasAccess(zone: ZoneCell[]): boolean {
    return zone.some((cell) => cell.ok);
}

/**
 * Клетки зоны предмета в абсолютных координатах — пусто, если тип осиротел или
 * зоны у стороны нет. Принимает и «предмет на курсоре» (у призрака нет id).
 */
export function propZoneCells(catalogue: PropCatalogue, prop: { type: string; x: number; y: number; dir?: PropDir }): { x: number; y: number }[] {
    const spec = catalogue[prop.type];
    const orientation = spec ? propOrientation(spec, prop.dir) : null;

    return orientation ? propInteractionCells(orientation, prop) : [];
}
