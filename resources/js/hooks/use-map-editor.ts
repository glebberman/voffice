import type { EditorCanvasHandle, Tile } from '@/components/editor/EditorCanvas';
import {
    blockedByProps,
    canPlace,
    footprintCells,
    hasAccess,
    propZoneCells,
    reachableFromSpawn,
    reachableWithout,
    zoneAvailability,
} from '@/editor/availability';
import { zonePreset } from '@/editor/zone-presets';
import type { PropGhostView, PropSelectionView, RectPreview } from '@/game/editor-scene';
import {
    fillRect,
    isWalkableChar,
    MAX_MAP_SIZE,
    resizeRows,
    setTile,
    type DoorData,
    type MapData,
    type PortalData,
    type PropData,
    type Zone,
} from '@/game/map';
import {
    nextPropDir,
    propAt,
    propDirs,
    propFits,
    propOrientation,
    propSpec,
    type PropCatalogue,
    type PropDir,
    type PropOrientation,
} from '@/game/props';
import { router } from '@inertiajs/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

export type Tool = 'paint' | 'rect' | 'spawn' | 'pan' | 'select' | 'door' | 'zone';

/** Тип, который сейчас расставляют из каталога, и выбранная сторона (цикл по R). */
interface Placing {
    type: string;
    dir: PropDir;
}

interface RoomInfo {
    slug: string;
    name: string;
    map: MapData;
}

/** Пустой результат обхода — когда подсвечивать нечего, BFS не запускаем вовсе. */
const NOTHING_REACHABLE: ReadonlySet<number> = new Set<number>();

/**
 * Ближайшая проходимая клетка к (x, y) — обходом по расширяющимся кольцам.
 * Нужна спавну после ужатия карты: клетка в новых границах может оказаться
 * стеной или столом, а спавн на непроходимой сервер не примет.
 */
function nearestWalkable(rows: string[], x: number, y: number): { x: number; y: number } {
    const w = rows[0]?.length ?? 0;
    const h = rows.length;
    const ok = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < w && cy < h && isWalkableChar(rows[cy][cx]);
    if (ok(x, y)) {
        return { x, y };
    }
    for (let r = 1; r < Math.max(w, h); r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(x + dx, y + dy)) {
                    return { x: x + dx, y: y + dy };
                }
            }
        }
    }

    return { x, y }; // проходимых клеток нет вовсе — пусть решает валидация
}

function isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

/**
 * Всё состояние редактора карты и команды над ним. Вынесено из страницы,
 * чтобы edit.tsx остался тонким оркестратором, а панели получали ровно свой
 * срез. Рисование по полю идёт через колбэки onTile*, панели — через сеттеры.
 */
export function useMapEditor(room: RoomInfo, catalogue: PropCatalogue) {
    const [name, setName] = useState(room.name);
    // строки карты как есть: правка одной строки вместо копирования всей сетки
    const [rows, setRows] = useState<string[]>(room.map.rows);
    const [spawn, setSpawn] = useState(room.map.spawn);
    const [portals, setPortals] = useState<PortalData[]>(room.map.portals);
    const [props, setProps] = useState<PropData[]>(room.map.props ?? []);
    const [doors, setDoors] = useState<DoorData[]>(room.map.doors ?? []);
    const [zones, setZones] = useState<Zone[]>(room.map.zones);
    const [selectedZone, setSelectedZone] = useState<number | null>(null);
    const [zoneKind, setZoneKind] = useState<string>('openspace'); // пресет для новых зон
    const [placing, setPlacing] = useState<Placing | null>(null); // предмет из каталога «на курсоре»
    const [selectedProp, setSelectedProp] = useState<number | null>(null);
    const [dragTarget, setDragTarget] = useState<Tile | null>(null); // куда ведут переносимый предмет
    const [tool, setToolState] = useState<Tool>('paint');
    const [brush, setBrush] = useState<string>('.');
    const [hover, setHoverState] = useState<Tile | null>(null);
    const [rectPreview, setRectPreview] = useState<RectPreview | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [sizeDraft, setSizeDraft] = useState({ w: room.map.rows[0].length, h: room.map.rows.length });

    const editorRef = useRef<EditorCanvasHandle | null>(null);
    // счётчик для уникального id предмета: Date.now() может совпасть при быстрой
    // постановке подряд, а дублирующийся id ломает выделение и ключи React
    const propSeq = useRef(0);
    const doorSeq = useRef(0);
    // якорь прямоугольника и флаг «сейчас рисуем кистью» — между down и up
    const rectStart = useRef<Tile | null>(null);
    const painting = useRef(false);
    // перенос стоящего предмета: индекс, смещение захвата и текущая цель;
    // держим в ref, чтобы onTileDrag/Up читали свежие значения без гонок ререндера
    const moveDrag = useRef<{ index: number; grabDx: number; grabDy: number; x: number; y: number } | null>(null);
    // свежие срезы для оконных слушателей (pointerup переноса из каталога, клавиши)
    const placingRef = useRef(placing);
    placingRef.current = placing;
    const selectedRef = useRef(selectedProp);
    selectedRef.current = selectedProp;
    const propsRef = useRef(props);
    propsRef.current = props;

    // Тайл под курсором меняется редко, а pointermove сыплется на каждый пиксель:
    // без этой отсечки редактор перерисовывался бы всё движение мыши подряд.
    const setHover = (tile: Tile | null) => {
        setHoverState((prev) => (prev?.x === tile?.x && prev?.y === tile?.y ? prev : tile));
    };

    const width = rows[0]?.length ?? 0;
    const height = rows.length;

    // клетки чужих оснований; переносимый предмет сам себе не мешает
    const occupied = useMemo(() => blockedByProps(catalogue, props, width), [catalogue, props, width]);
    const occupiedWithout = (exceptId?: string): ReadonlySet<number> => {
        const own = exceptId ? props.find((p) => p.id === exceptId) : undefined;
        if (!own) {
            return occupied;
        }
        const set = new Set(occupied);
        for (const cell of footprintCells(catalogue, own)) {
            set.delete(cell.y * width + cell.x);
        }
        return set;
    };

    /** Встанет ли предмет — по тем же правилам, что и на сервере. */
    const fits = (o: PropOrientation, x: number, y: number, exceptId?: string): boolean =>
        canPlace(o, x, y, { width, height, spawn, doors, portals, occupied: occupiedWithout(exceptId) });

    // сторона, ориентация и «влезает ли» — для призрака и постановки
    const ghostFor = (type: string, dir: PropDir | undefined, x: number, y: number, exceptId?: string): PropGhostView | null => {
        const spec = propSpec(catalogue, type);
        const o = spec ? propOrientation(spec, dir) : null;
        return o ? { x, y, w: o.w, h: o.h, tall: o.tall, valid: fits(o, x, y, exceptId) } : null;
    };

    const applyTile = (x: number, y: number) => {
        if (tool === 'spawn') {
            setSpawn({ x, y });
            return;
        }
        if (tool === 'door') {
            // дверь только на проходимой клетке — на стене она заперла бы проход навсегда
            if (!isWalkableChar(rows[y][x]) || doors.some((d) => d.x === x && d.y === y)) {
                return;
            }
            // id не завязан на координаты: перенос двери его не меняет, а вторая
            // дверь на освободившейся клетке не унаследует чужое состояние
            setDoors((prev) => [...prev, { id: `door-${Date.now()}-${doorSeq.current++}`, x, y, lock: null }]);
            return;
        }
        setRows((prev) => setTile(prev, x, y, brush));
    };

    // Ставит предмет из каталога, если он влезает в клетку. dir=south не храним:
    // отсутствие поля и есть south, так карты остаются минимальными. Режим
    // расстановки не сбрасываем — можно ставить подряд, как кистью, но
    // свежепоставленный сразу выделяем: панель настроек открывается на нём.
    const placeAt = (tile: Tile, p: Placing) => {
        const g = ghostFor(p.type, p.dir, tile.x, tile.y);
        if (!g?.valid) {
            return;
        }
        // индекс новинки = текущая длина (propsRef свежий, без гонки закрытия placeAt)
        const idx = propsRef.current.length;
        setProps((prev) => [
            ...prev,
            { id: `${p.type}-${Date.now()}-${propSeq.current++}`, type: p.type, x: tile.x, y: tile.y, ...(p.dir === 'south' ? {} : { dir: p.dir }) },
        ]);
        setSelectedProp(idx);
    };

    // Клик по карточке каталога «берёт» предмет на курсор: дальше клик по полю
    // ставит его. Плюс поддержан перенос — если кнопку отпустят уже над полем
    // (pointerup идёт мимо канваса), ставим там же.
    const pickCatalog = (type: string) => {
        const spec = propSpec(catalogue, type);
        if (!spec) {
            return;
        }
        const next: Placing = { type, dir: propDirs(spec)[0] ?? 'south' };
        setPlacing(next);
        setSelectedProp(null);
        setToolState('select');

        const onUp = (e: PointerEvent) => {
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            const tile = editorRef.current?.screenToTile(e.clientX, e.clientY) ?? null;
            const cur = placingRef.current;
            if (tile && cur) {
                placeAt(tile, cur); // сторона могла смениться по R за время переноса — берём свежую
            }
        };
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    // Поворот меняет footprint, поэтому сперва проверяем, что предмет в новой
    // ориентации помещается на прежнем месте.
    const rotateProp = (i: number, dir: PropDir) => {
        setProps((prev) =>
            prev.map((o, j) => {
                if (j !== i) {
                    return o;
                }
                const spec = propSpec(catalogue, o.type);
                const orientation = spec ? propOrientation(spec, dir) : null;
                if (!orientation || !fits(orientation, o.x, o.y, o.id)) {
                    return o;
                }
                return { ...o, dir: dir === 'south' ? undefined : dir };
            }),
        );
    };

    // Панель правит координаты числами — те же правила, что и у призрака:
    // молча принятая правка позже завалила бы сохранение всей карты. Гейт нужен,
    // только если патч трогает место предмета; правку настроек (settings) он не
    // касается — её форму сервер проверяет отдельно, от позиции не зависит.
    const patchProp = (i: number, patch: Partial<PropData>) => {
        const movesProp = patch.x !== undefined || patch.y !== undefined || patch.dir !== undefined;
        setProps((prev) =>
            prev.map((o, j) => {
                if (j !== i) {
                    return o;
                }
                const next = { ...o, ...patch };
                if (!movesProp) {
                    return next;
                }
                const spec = propSpec(catalogue, next.type);
                const orientation = spec ? propOrientation(spec, next.dir) : null;

                return orientation && !fits(orientation, next.x, next.y, o.id) ? o : next;
            }),
        );
    };

    const removeProp = (i: number) => {
        setProps((prev) => prev.filter((_, j) => j !== i));
        setSelectedProp(null);
        // удалить могли прямо во время переноса (Delete зажатой мышью) — снимаем
        // перенос, иначе индекс в moveDrag укажет уже на чужой предмет
        moveDrag.current = null;
        setDragTarget(null);
    };

    // Явный выбор инструмента (в т.ч. «Выделение») снимает «предмет на курсоре»
    // и выделение — пользователь переключает режим. Расстановку из каталога
    // включает pickCatalog в обход этого сеттера (там tool ставится напрямую).
    const setTool = (t: Tool) => {
        setToolState(t);
        setPlacing(null);
        setSelectedProp(null);
    };

    // клик/протяжка по полю: EditorCanvas не знает про инструменты — знает хук.
    // Прямоугольник и область обводятся одинаково (rectPreview), различаются
    // лишь тем, что делается на отпускании.
    const dragsRect = tool === 'rect' || tool === 'zone';

    const onTileDown = (tile: Tile) => {
        if (placing) {
            placeAt(tile, placing);
            return;
        }
        if (dragsRect) {
            rectStart.current = tile;
            setRectPreview({ x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y });
            return;
        }
        if (tool === 'select') {
            // клик по предмету выделяет его и начинает возможный перенос; по пустому — снимает выделение
            const idx = propAt(catalogue, props, tile.x, tile.y);
            if (idx !== null) {
                const p = props[idx];
                setSelectedProp(idx);
                moveDrag.current = { index: idx, grabDx: tile.x - p.x, grabDy: tile.y - p.y, x: p.x, y: p.y };
                setDragTarget({ x: p.x, y: p.y });
            } else {
                setSelectedProp(null);
            }
            return;
        }
        painting.current = tool === 'paint';
        applyTile(tile.x, tile.y);
    };

    const onTileDrag = (tile: Tile) => {
        if (placing) {
            return; // призрак ведёт hover, а не протяжка
        }
        if (dragsRect) {
            const start = rectStart.current;
            if (start) {
                setRectPreview({ x0: start.x, y0: start.y, x1: tile.x, y1: tile.y });
            }
            return;
        }
        const md = moveDrag.current;
        if (md) {
            md.x = tile.x - md.grabDx;
            md.y = tile.y - md.grabDy;
            setDragTarget({ x: md.x, y: md.y });
            return;
        }
        if (painting.current) {
            applyTile(tile.x, tile.y);
        }
    };

    const onTileUp = () => {
        const md = moveDrag.current;
        if (md) {
            // индекс мог устареть, если предмет удалили во время переноса
            const p = md.index < props.length ? props[md.index] : undefined;
            const spec = p ? propSpec(catalogue, p.type) : null;
            const orientation = p && spec ? propOrientation(spec, p.dir) : null;
            // пишем, только если реально сдвинули и предмет влезает: иначе простой
            // клик-выделение зря пересобирал бы весь слой спрайтов (мерцание)
            if (p && orientation && (md.x !== p.x || md.y !== p.y) && fits(orientation, md.x, md.y, p.id)) {
                setProps((prev) => prev.map((pp, j) => (j === md.index ? { ...pp, x: md.x, y: md.y } : pp)));
            }
            moveDrag.current = null;
            setDragTarget(null);
        }
        if (rectPreview) {
            if (tool === 'rect') {
                setRows((prev) => fillRect(prev, rectPreview.x0, rectPreview.y0, rectPreview.x1, rectPreview.y1, brush));
            } else if (tool === 'zone') {
                const preset = zonePreset(zoneKind);
                const zone: Zone = {
                    name: preset.label,
                    x1: Math.min(rectPreview.x0, rectPreview.x1),
                    y1: Math.min(rectPreview.y0, rectPreview.y1),
                    x2: Math.max(rectPreview.x0, rectPreview.x1),
                    y2: Math.max(rectPreview.y0, rectPreview.y1),
                    kind: preset.kind,
                    ...(preset.isPrivate ? { isPrivate: true } : {}),
                };
                setZones((prev) => [...prev, zone]);
                setSelectedZone(zones.length); // свежесозданную сразу подсвечиваем
            }
        }
        rectStart.current = null;
        painting.current = false;
        setRectPreview(null);
    };

    // R — цикл ориентаций (у предмета на курсоре и у выделенного), Esc —
    // отмена, Delete — удалить выделенный. Слушаем окно; refs дают свежий срез.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isTyping(e.target)) {
                return;
            }
            if (e.key === 'Escape') {
                if (placingRef.current) {
                    setPlacing(null);
                } else {
                    setSelectedProp(null);
                }
                return;
            }
            if (e.key === 'r' || e.key === 'R') {
                const cur = placingRef.current;
                if (cur) {
                    const spec = propSpec(catalogue, cur.type);
                    if (spec) {
                        setPlacing({ type: cur.type, dir: nextPropDir(spec, cur.dir) });
                        e.preventDefault();
                    }
                    return;
                }
                const sel = selectedRef.current;
                if (sel !== null && sel < propsRef.current.length) {
                    const p = propsRef.current[sel];
                    const spec = propSpec(catalogue, p.type);
                    if (spec) {
                        rotateProp(sel, nextPropDir(spec, p.dir));
                        e.preventDefault();
                    }
                }
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current !== null) {
                removeProp(selectedRef.current);
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // width/height в deps: onKey замыкает rotateProp, а тот проверяет propFits
        // по текущим размерам карты — после ресайза пересобираем обработчик
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catalogue, width, height]);

    /** Размер из полей, зажатый в допустимые пределы — им же меряем потери. */
    const resizeTo = { w: Math.max(3, Math.min(MAX_MAP_SIZE, sizeDraft.w)), h: Math.max(3, Math.min(MAX_MAP_SIZE, sizeDraft.h)) };

    // Что не переживёт применение размера. Считаем заранее и показываем в
    // панели: возврат прежнего размера удалённое не воскрешает, а «ужал —
    // посмотрел — вернул» стирал мебель по краям молча.
    const resizeLoss = useMemo(() => {
        const { w, h } = resizeTo;
        const lostProps = props.filter((p) => {
            const spec = propSpec(catalogue, p.type);
            const orientation = spec ? propOrientation(spec, p.dir) : null;
            return !orientation || !propFits(orientation, p.x, p.y, w, h);
        }).length;

        return {
            props: lostProps,
            doors: doors.filter((d) => d.x >= w || d.y >= h).length,
            portals: portals.filter((p) => p.x >= w || p.y >= h).length,
            zones: zones.filter((z) => z.x1 >= w || z.y1 >= h).length,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catalogue, props, doors, portals, zones, resizeTo.w, resizeTo.h]);

    const applyResize = () => {
        const { w, h } = resizeTo;
        const resized = resizeRows(rows, w, h);
        setRows(resized);
        // Клампим спавн в новые границы, но не на стену и не в мебель: после
        // ужатия угол (w-2, h-2) вполне может оказаться столом.
        setSpawn((prev) => nearestWalkable(resized, Math.min(prev.x, w - 2), Math.min(prev.y, h - 2)));
        setPortals((prev) => prev.filter((p) => p.x < w && p.y < h));
        setDoors((prev) => prev.filter((d) => d.x < w && d.y < h));
        setProps((prev) =>
            prev.filter((p) => {
                const spec = propSpec(catalogue, p.type);
                const orientation = spec ? propOrientation(spec, p.dir) : null;
                return orientation ? propFits(orientation, p.x, p.y, w, h) : false;
            }),
        );
        // зоны обрезаем по новым границам, вырожденные (углы за краем) убираем
        setZones((prev) => prev.filter((z) => z.x1 < w && z.y1 < h).map((z) => ({ ...z, x2: Math.min(z.x2, w - 1), y2: Math.min(z.y2, h - 1) })));
        setSelectedZone(null);
        setSelectedProp(null); // индексы предметов после фильтрации могли съехать
        setPlacing(null);
        setSizeDraft({ w, h });
    };

    /**
     * Серверная ошибка вида `map.props.7` сама по себе не говорит, о каком
     * предмете речь: подставляем к сообщению название и координаты.
     */
    const explain = (key: string, message: string): string => {
        const at = /^map\.(props|doors|zones|portals)\.(\d+)/.exec(key);
        if (!at) {
            return message;
        }
        const i = Number(at[2]);
        if (at[1] === 'props') {
            const prop = props.at(i);
            const spec = prop ? propSpec(catalogue, prop.type) : null;

            return prop ? `${spec?.label ?? prop.type} (${prop.x}, ${prop.y}): ${message}` : message;
        }
        if (at[1] === 'doors') {
            const door = doors.at(i);

            return door ? `Дверь (${door.x}, ${door.y}): ${message}` : message;
        }
        if (at[1] === 'zones') {
            const zone = zones.at(i);

            return zone ? `Зона «${zone.name}»: ${message}` : message;
        }
        const portal = portals.at(i);

        return portal ? `Портал → ${portal.to} (${portal.x}, ${portal.y}): ${message}` : message;
    };

    const save = () => {
        setSaving(true);
        setErrors([]);
        const map: MapData = { rows, spawn, zones, portals, props, doors };
        router.put(
            `/rooms/${room.slug}`,
            { name, map: map as unknown as Record<string, never> },
            {
                onError: (errs) => {
                    setErrors(Object.entries(errs).map(([key, message]) => explain(key, message)));
                    setSaving(false);
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    // призрак предмета: при переносе — на цели переноса, при расстановке — под курсором
    const move = moveDrag.current;
    const propGhost: PropGhostView | null =
        dragTarget && move && move.index < props.length
            ? ghostFor(props[move.index].type, props[move.index].dir, dragTarget.x, dragTarget.y, props[move.index].id)
            : placing && hover
              ? ghostFor(placing.type, placing.dir, hover.x, hover.y)
              : null;

    // рамка выделенного предмета
    let propSelection: PropSelectionView | null = null;
    if (selectedProp !== null && selectedProp < props.length) {
        const p = props[selectedProp];
        const spec = propSpec(catalogue, p.type);
        const orientation = spec ? propOrientation(spec, p.dir) : null;
        if (orientation) {
            propSelection = { x: p.x, y: p.y, w: orientation.w, h: orientation.h };
        }
    }

    // --- доступность зоны взаимодействия (правила — в editor/availability.ts) ---
    // Чью зону показываем: предмет на курсоре → переносимый → выделенный.
    // Призрак, который не влезает, зону не рисует: он и так красный, а зелёная
    // зона рядом с ним противоречила бы сама себе.
    const zoneOf =
        propGhost && !propGhost.valid
            ? null
            : placing && hover
              ? { type: placing.type, dir: placing.dir, x: hover.x, y: hover.y }
              : dragTarget && move && move.index < props.length
                ? { type: props[move.index].type, dir: props[move.index].dir, x: dragTarget.x, y: dragTarget.y }
                : selectedProp !== null && selectedProp < props.length
                  ? props[selectedProp]
                  : null;
    // слепок активного предмета: zoneOf пересобирается каждый рендер, а мемо
    // должны держаться за то, что реально изменилось
    const zoneKey = zoneOf ? `${zoneOf.type}:${zoneOf.dir ?? 'south'}:${zoneOf.x}:${zoneOf.y}` : '';

    // Обход идёт по всей карте (на 512×512 это десятки миллисекунд), поэтому
    // берём отложенные строки: кисть рисует по тайлу за раз и не должна
    // спотыкаться о пересчёт подсветки. Размеры — тоже от этих строк: после
    // ресайза rows уже новые, а deferredRows ещё старые, и индексы y*w+x
    // разъехались бы между обходом и вердиктом.
    const deferredRows = useDeferredValue(rows);
    const zoneWidth = deferredRows[0]?.length ?? 0;
    const zoneHeight = deferredRows.length;

    // Прежнее место переносимого предмета ему же не мешает.
    const draggingId = dragTarget && move && move.index < props.length ? props[move.index].id : undefined;
    const blocked = useMemo(() => blockedByProps(catalogue, props, zoneWidth, draggingId), [catalogue, props, zoneWidth, draggingId]);

    // считать нечего, если ни одного функционального предмета и никого не ведут
    const hasFunctional = useMemo(() => props.some((p) => propSpec(catalogue, p.type)?.behavior != null), [props, catalogue]);
    const showsZone = zoneKey !== '';
    // Полный обход намеренно НЕ зависит от предмета на курсоре: иначе он шёл бы
    // заново на каждый тайл под мышью. Место, которое предмет займёт, влияет
    // только локально — его проверяет stillReachable.
    const reachable = useMemo(
        () => (hasFunctional || showsZone ? reachableFromSpawn(deferredRows, blocked, spawn) : NOTHING_REACHABLE),
        [hasFunctional, showsZone, deferredRows, blocked, spawn],
    );

    // клетки, которые займёт предмет, встав туда, куда его ведут
    const futureFootprint = useMemo(() => {
        const set = new Set<number>();
        for (const cell of zoneOf ? footprintCells(catalogue, zoneOf) : []) {
            set.add(cell.y * zoneWidth + cell.x);
        }
        return set;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoneKey, catalogue, zoneWidth]);

    // Достижимость с учётом будущего места предмета. Второй обход нужен, только
    // если это место вообще попадает на достижимые клетки: у выделенного (а не
    // переносимого) предмета основание уже учтено в blocked, и связность
    // измениться не может.
    const afterPlacing = useMemo(() => {
        let touches = false;
        for (const cell of futureFootprint) {
            if (reachable.has(cell)) {
                touches = true;
                break;
            }
        }
        return touches ? reachableWithout(reachable, futureFootprint, zoneWidth, spawn) : reachable;
    }, [reachable, futureFootprint, zoneWidth, spawn]);

    const interactionZone = useMemo(() => {
        const cells = zoneOf ? propZoneCells(catalogue, zoneOf) : [];
        return cells.length > 0 ? zoneAvailability(cells, afterPlacing, zoneWidth, zoneHeight) : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoneKey, catalogue, afterPlacing, zoneWidth, zoneHeight]);

    // значок «недоступен» у функциональных предметов, к которым не подойти
    const unavailableMarks = useMemo(
        () =>
            props.flatMap((prop) => {
                const spec = propSpec(catalogue, prop.type);
                const orientation = spec ? propOrientation(spec, prop.dir) : null;
                if (!spec?.behavior || !orientation) {
                    return [];
                }
                if (hasAccess(zoneAvailability(propZoneCells(catalogue, prop), afterPlacing, zoneWidth, zoneHeight))) {
                    return [];
                }
                return [{ x: prop.x + orientation.w / 2, y: prop.y + orientation.h / 2 }]; // середина основания
            }),
        [catalogue, props, afterPlacing, zoneWidth, zoneHeight],
    );

    return {
        // мета и данные
        name,
        setName,
        rows,
        spawn,
        setSpawn,
        portals,
        setPortals,
        props,
        setProps,
        doors,
        setDoors,
        zones,
        setZones,
        selectedZone,
        setSelectedZone,
        zoneKind,
        setZoneKind,
        width,
        height,
        // инструменты
        tool,
        setTool,
        brush,
        setBrush,
        // каталог и предметы
        placing,
        pickCatalog,
        selectedProp,
        setSelectedProp,
        rotateProp,
        patchProp,
        removeProp,
        propGhost,
        propSelection,
        interactionZone,
        unavailableMarks,
        // поле
        hover,
        setHover,
        rectPreview,
        editorRef,
        onTileDown,
        onTileDrag,
        onTileUp,
        // размер и сохранение
        sizeDraft,
        setSizeDraft,
        applyResize,
        resizeLoss,
        save,
        saving,
        errors,
    };
}

export type MapEditor = ReturnType<typeof useMapEditor>;
