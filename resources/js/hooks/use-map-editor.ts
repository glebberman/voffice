import type { EditorCanvasHandle, Tile } from '@/components/editor/EditorCanvas';
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
    type MapObjectData,
    type PortalData,
    type PropData,
    type Zone,
} from '@/game/map';
import { nextPropDir, propAt, propDirs, propFits, propOrientation, propSpec, type PropCatalogue, type PropDir } from '@/game/props';
import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';

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
    const [objects, setObjects] = useState<MapObjectData[]>(room.map.objects);
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
    const [hover, setHover] = useState<Tile | null>(null);
    const [rectPreview, setRectPreview] = useState<RectPreview | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [sizeDraft, setSizeDraft] = useState({ w: room.map.rows[0].length, h: room.map.rows.length });

    const editorRef = useRef<EditorCanvasHandle | null>(null);
    // счётчик для уникального id предмета: Date.now() может совпасть при быстрой
    // постановке подряд, а дублирующийся id ломает выделение и ключи React
    const propSeq = useRef(0);
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

    const width = rows[0]?.length ?? 0;
    const height = rows.length;

    // сторона, ориентация и «влезает ли» — для призрака и постановки
    const ghostFor = (type: string, dir: PropDir | undefined, x: number, y: number): PropGhostView | null => {
        const spec = propSpec(catalogue, type);
        const o = spec ? propOrientation(spec, dir) : null;
        return o ? { x, y, w: o.w, h: o.h, tall: o.tall, valid: propFits(o, x, y, width, height) } : null;
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
            setDoors((prev) => [...prev, { id: `door-${x}-${y}`, x, y, lock: null }]);
            return;
        }
        setRows((prev) => setTile(prev, x, y, brush));
    };

    // Ставит предмет из каталога, если он влезает в клетку. dir=south не храним:
    // отсутствие поля и есть south, так карты остаются минимальными. Режим
    // расстановки не сбрасываем — можно ставить подряд, как кистью.
    const placeAt = (tile: Tile, p: Placing) => {
        const g = ghostFor(p.type, p.dir, tile.x, tile.y);
        if (!g?.valid) {
            return;
        }
        setProps((prev) => [
            ...prev,
            { id: `${p.type}-${Date.now()}-${propSeq.current++}`, type: p.type, x: tile.x, y: tile.y, ...(p.dir === 'south' ? {} : { dir: p.dir }) },
        ]);
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
                if (!orientation || !propFits(orientation, o.x, o.y, width, height)) {
                    return o;
                }
                return { ...o, dir: dir === 'south' ? undefined : dir };
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
            if (p && orientation && (md.x !== p.x || md.y !== p.y) && propFits(orientation, md.x, md.y, width, height)) {
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

    const applyResize = () => {
        const w = Math.max(3, Math.min(MAX_MAP_SIZE, sizeDraft.w));
        const h = Math.max(3, Math.min(MAX_MAP_SIZE, sizeDraft.h));
        setRows((prev) => resizeRows(prev, w, h));
        setSpawn((prev) => ({ x: Math.min(prev.x, w - 2), y: Math.min(prev.y, h - 2) }));
        setObjects((prev) => prev.filter((o) => o.x < w && o.y < h));
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

    const save = () => {
        setSaving(true);
        setErrors([]);
        const map: MapData = { rows, spawn, zones, objects, portals, props, doors };
        router.put(
            `/rooms/${room.slug}`,
            { name, map: map as unknown as Record<string, never> },
            {
                onError: (errs) => {
                    setErrors(Object.values(errs));
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
            ? ghostFor(props[move.index].type, props[move.index].dir, dragTarget.x, dragTarget.y)
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

    return {
        // мета и данные
        name,
        setName,
        rows,
        spawn,
        setSpawn,
        objects,
        setObjects,
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
        removeProp,
        propGhost,
        propSelection,
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
        save,
        saving,
        errors,
    };
}

export type MapEditor = ReturnType<typeof useMapEditor>;
