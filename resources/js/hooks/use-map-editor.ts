import type { EditorCanvasHandle, Tile } from '@/components/editor/EditorCanvas';
import { zonePreset } from '@/editor/zone-presets';
import type { RectPreview } from '@/game/editor-scene';
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
import { propFits, propOrientation, propSpec, type PropCatalogue, type PropDir } from '@/game/props';
import { router } from '@inertiajs/react';
import { useRef, useState } from 'react';

export type Tool = 'paint' | 'rect' | 'spawn' | 'pan' | 'prop' | 'door' | 'zone';

interface RoomInfo {
    slug: string;
    name: string;
    map: MapData;
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
    const [propType, setPropType] = useState<string>(Object.keys(catalogue)[0] ?? '');
    const [tool, setTool] = useState<Tool>('paint');
    const [brush, setBrush] = useState<string>('.');
    const [hover, setHover] = useState<Tile | null>(null);
    const [rectPreview, setRectPreview] = useState<RectPreview | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [sizeDraft, setSizeDraft] = useState({ w: room.map.rows[0].length, h: room.map.rows.length });

    const editorRef = useRef<EditorCanvasHandle | null>(null);
    // якорь прямоугольника и флаг «сейчас рисуем кистью» — между down и up
    const rectStart = useRef<Tile | null>(null);
    const painting = useRef(false);

    const width = rows[0]?.length ?? 0;
    const height = rows.length;

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
        if (tool === 'prop') {
            const spec = propSpec(catalogue, propType);
            // расстановка пока всегда стороной по умолчанию (south)
            const orientation = spec ? propOrientation(spec) : null;
            if (!orientation || !propFits(orientation, x, y, width, height)) {
                return; // не помещается — основание или часть в воздухе вылезут за карту
            }
            setProps((prev) => [...prev, { id: `${propType}-${Date.now()}`, type: propType, x, y }]);
            return;
        }
        setRows((prev) => setTile(prev, x, y, brush));
    };

    // Поворот меняет footprint, поэтому сперва проверяем, что предмет в новой
    // ориентации помещается на прежнем месте. dir=south не храним: отсутствие
    // поля и есть south, так карты остаются минимальными.
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

    // клик/протяжка по полю: EditorCanvas не знает про инструменты — знает хук.
    // Прямоугольник и область обводятся одинаково (rectPreview), различаются
    // лишь тем, что делается на отпускании.
    const dragsRect = tool === 'rect' || tool === 'zone';

    const onTileDown = (tile: Tile) => {
        if (dragsRect) {
            rectStart.current = tile;
            setRectPreview({ x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y });
            return;
        }
        painting.current = tool === 'paint';
        applyTile(tile.x, tile.y);
    };

    const onTileDrag = (tile: Tile) => {
        if (dragsRect) {
            const start = rectStart.current;
            if (start) {
                setRectPreview({ x0: start.x, y0: start.y, x1: tile.x, y1: tile.y });
            }
            return;
        }
        if (painting.current) {
            applyTile(tile.x, tile.y);
        }
    };

    const onTileUp = () => {
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
        propType,
        setPropType,
        // поле
        hover,
        setHover,
        rectPreview,
        editorRef,
        onTileDown,
        onTileDrag,
        onTileUp,
        rotateProp,
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
