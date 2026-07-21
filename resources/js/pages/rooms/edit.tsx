import { EditorCanvas, type EditorCanvasHandle, type Tile } from '@/components/editor/EditorCanvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RectPreview } from '@/game/editor-scene';
import {
    fillRect,
    isWalkableChar,
    LOCK_SIDE_LABEL,
    LOCK_SIDES,
    MAX_MAP_SIZE,
    resizeRows,
    setTile,
    TILE_CHARS,
    type DoorData,
    type LockSide,
    type MapData,
    type MapObjectData,
    type PortalData,
    type PropData,
} from '@/game/map';
import { PROP_DIR_LABEL, propDirs, propFits, propOrientation, propSpec, type PropCatalogue, type PropDir } from '@/game/props';
import { TILE_COLOR, TILE_LABEL } from '@/game/tile-colors';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Armchair, DoorOpen, Hand, Plus, Save, Square, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState } from 'react';

interface RoomInfo {
    id: number;
    slug: string;
    name: string;
    map: MapData;
}

interface EditProps extends SharedData {
    room: RoomInfo;
    rooms: { slug: string; name: string }[];
    propTypes: PropCatalogue;
}

type Tool = 'paint' | 'rect' | 'spawn' | 'pan' | 'prop' | 'door';

const OBJECT_TYPES = [
    { value: 'board', label: 'Доска' },
    { value: 'video', label: 'Видео' },
    { value: 'map', label: 'Карта' },
    { value: 'link', label: 'Ссылка' },
] as const;

export default function RoomEdit() {
    const { room, rooms, propTypes } = usePage<EditProps>().props;
    const propKeys = Object.keys(propTypes);

    const [name, setName] = useState(room.name);
    // строки карты как есть: правка одной строки вместо копирования всей сетки
    const [rows, setRows] = useState<string[]>(room.map.rows);
    const [spawn, setSpawn] = useState(room.map.spawn);
    const [objects, setObjects] = useState<MapObjectData[]>(room.map.objects);
    const [portals, setPortals] = useState<PortalData[]>(room.map.portals);
    const [props, setProps] = useState<PropData[]>(room.map.props ?? []);
    const [doors, setDoors] = useState<DoorData[]>(room.map.doors ?? []);
    const [propType, setPropType] = useState<string>(propKeys[0] ?? '');
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
            const spec = propSpec(propTypes, propType);
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
                const spec = propSpec(propTypes, o.type);
                const orientation = spec ? propOrientation(spec, dir) : null;
                if (!orientation || !propFits(orientation, o.x, o.y, width, height)) {
                    return o;
                }
                return { ...o, dir: dir === 'south' ? undefined : dir };
            }),
        );
    };

    // клик/протяжка по полю: инструмент решает EditorCanvas не знает — знает страница
    const onTileDown = (tile: Tile) => {
        if (tool === 'rect') {
            rectStart.current = tile;
            setRectPreview({ x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y });
            return;
        }
        painting.current = tool === 'paint';
        applyTile(tile.x, tile.y);
    };

    const onTileDrag = (tile: Tile) => {
        if (tool === 'rect') {
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
        if (tool === 'rect' && rectPreview) {
            setRows((prev) => fillRect(prev, rectPreview.x0, rectPreview.y0, rectPreview.x1, rectPreview.y1, brush));
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
                const spec = propSpec(propTypes, p.type);
                const orientation = spec ? propOrientation(spec, p.dir) : null;
                return orientation ? propFits(orientation, p.x, p.y, w, h) : false;
            }),
        );
        setSizeDraft({ w, h });
    };

    const save = () => {
        setSaving(true);
        setErrors([]);
        const map: MapData = { rows, spawn, zones: room.map.zones, objects, portals, props, doors };
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

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Комнаты', href: '/rooms' },
                { title: room.name, href: `/rooms/${room.slug}` },
                { title: 'Редактор', href: `/rooms/${room.slug}/edit` },
            ]}
        >
            <Head title={`Редактор — ${room.name}`} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 lg:flex-row">
                {/* поле фиксированной высоты, закреплено — длинные панели скроллятся рядом */}
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
                    <EditorCanvas
                        ref={editorRef}
                        rows={rows}
                        props={props}
                        doors={doors}
                        spawn={spawn}
                        objects={objects}
                        portals={portals}
                        catalogue={propTypes}
                        rectPreview={rectPreview}
                        panTool={tool === 'pan'}
                        onTileDown={onTileDown}
                        onTileDrag={onTileDrag}
                        onTileUp={onTileUp}
                        onHover={setHover}
                    />
                    {/* строка статуса заменяет per-cell тултипы, которых нет у канваса */}
                    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                        <span>
                            Карта {width}×{height}
                        </span>
                        {hover && rows[hover.y]?.[hover.x] && (
                            <span>
                                ({hover.x}, {hover.y}) — {TILE_LABEL[rows[hover.y][hover.x]] ?? rows[hover.y][hover.x]}
                            </span>
                        )}
                        <span className="ml-auto">Колесо — зум · пробел, средняя кнопка или «рука» — сдвиг</span>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-4 overflow-y-auto lg:w-96">
                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <Label className="mb-1.5 block">Название комнаты</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <Label className="mb-1.5 block">
                            Размер карты (до {MAX_MAP_SIZE}×{MAX_MAP_SIZE})
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min={3}
                                max={MAX_MAP_SIZE}
                                value={sizeDraft.w}
                                onChange={(e) => setSizeDraft((s) => ({ ...s, w: Number(e.target.value) || 3 }))}
                                className="h-8"
                            />
                            <span className="text-muted-foreground">×</span>
                            <Input
                                type="number"
                                min={3}
                                max={MAX_MAP_SIZE}
                                value={sizeDraft.h}
                                onChange={(e) => setSizeDraft((s) => ({ ...s, h: Number(e.target.value) || 3 }))}
                                className="h-8"
                            />
                            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={applyResize}>
                                Применить
                            </Button>
                        </div>
                        <p className="text-muted-foreground mt-1.5 text-xs">Новое место заполняется полом, периметр остаётся стеной.</p>
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-3 flex flex-wrap gap-1">
                            <Button size="sm" variant={tool === 'paint' ? 'default' : 'outline'} onClick={() => setTool('paint')}>
                                Кисть
                            </Button>
                            <Button size="sm" variant={tool === 'rect' ? 'default' : 'outline'} onClick={() => setTool('rect')}>
                                <Square className="size-3.5" />
                                Прямоугольник
                            </Button>
                            <Button size="sm" variant={tool === 'spawn' ? 'default' : 'outline'} onClick={() => setTool('spawn')}>
                                Спавн ⚑
                            </Button>
                            <Button size="sm" variant={tool === 'prop' ? 'default' : 'outline'} onClick={() => setTool('prop')}>
                                <Armchair className="size-3.5" />
                                Предмет
                            </Button>
                            <Button size="sm" variant={tool === 'door' ? 'default' : 'outline'} onClick={() => setTool('door')}>
                                <DoorOpen className="size-3.5" />
                                Дверь
                            </Button>
                            <Button size="sm" variant={tool === 'pan' ? 'default' : 'outline'} onClick={() => setTool('pan')}>
                                <Hand className="size-3.5" />
                            </Button>
                            <span className="ml-auto flex items-center gap-1">
                                <Button size="icon" variant="outline" className="size-8" onClick={() => editorRef.current?.zoomOut()}>
                                    <ZoomOut className="size-3.5" />
                                </Button>
                                <Button size="icon" variant="outline" className="size-8" onClick={() => editorRef.current?.zoomIn()}>
                                    <ZoomIn className="size-3.5" />
                                </Button>
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {TILE_CHARS.map((ch) => (
                                <button
                                    key={ch}
                                    type="button"
                                    onClick={() => {
                                        setBrush(ch);
                                        if (tool === 'pan' || tool === 'spawn') {
                                            setTool('paint');
                                        }
                                    }}
                                    className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${
                                        brush === ch ? 'ring-primary ring-2' : ''
                                    }`}
                                >
                                    <span className="size-4 shrink-0 rounded-sm border" style={{ background: TILE_COLOR[ch] }} />
                                    {TILE_LABEL[ch]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-2 flex items-center">
                            <h3 className="text-sm font-semibold">Двери 🚪</h3>
                            <span className="text-muted-foreground ml-auto text-xs">{doors.length} шт.</span>
                        </div>
                        <p className="text-muted-foreground mb-2 text-xs">
                            Инструмент «Дверь» ставит её на проходимую клетку — обычно в проём стены. Закрытая дверь не пропускает и прячет всё, до
                            чего без неё не добраться. Замок можно повернуть только с той стороны, где он висит.
                        </p>
                        {doors.length > 0 && (
                            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                                {doors.map((d, i) => (
                                    <div key={d.id} className="flex items-center gap-1.5 text-xs">
                                        <CoordInput
                                            label="x"
                                            value={d.x}
                                            max={width - 1}
                                            onChange={(v) => setDoors((prev) => prev.map((o, j) => (j === i ? { ...o, x: v } : o)))}
                                        />
                                        <CoordInput
                                            label="y"
                                            value={d.y}
                                            max={height - 1}
                                            onChange={(v) => setDoors((prev) => prev.map((o, j) => (j === i ? { ...o, y: v } : o)))}
                                        />
                                        <Select
                                            value={d.lock ?? 'none'}
                                            onValueChange={(v) =>
                                                setDoors((prev) =>
                                                    prev.map((o, j) => (j === i ? { ...o, lock: v === 'none' ? null : (v as LockSide) } : o)),
                                                )
                                            }
                                        >
                                            <SelectTrigger className="h-7 flex-1 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">без замка</SelectItem>
                                                {LOCK_SIDES.map((side) => (
                                                    <SelectItem key={side} value={side}>
                                                        замок {LOCK_SIDE_LABEL[side]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-6"
                                            onClick={() => setDoors((prev) => prev.filter((_, j) => j !== i))}
                                        >
                                            <Trash2 className="size-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-2 flex items-center">
                            <h3 className="text-sm font-semibold">Предметы 🪑</h3>
                            <span className="text-muted-foreground ml-auto text-xs">{props.length} шт.</span>
                        </div>
                        <p className="text-muted-foreground mb-2 text-xs">
                            Выберите предмет и кликните по карте. Основание блокирует проход, часть в воздухе — нет: за ней можно пройти.{' '}
                            <a href="/props" className="underline">
                                Каталог предметов
                            </a>
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {propKeys.map((type) => {
                                const spec = propTypes[type];
                                const orientation = spec ? propOrientation(spec) : null;
                                if (!spec || !orientation) {
                                    return null;
                                }

                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => {
                                            setPropType(type);
                                            setTool('prop');
                                        }}
                                        className={`rounded-md border px-2 py-1 text-left text-xs ${
                                            propType === type && tool === 'prop' ? 'ring-primary ring-2' : ''
                                        }`}
                                    >
                                        <span className="block truncate">{spec.label}</span>
                                        <span className="text-muted-foreground">
                                            {orientation.w}×{orientation.h}
                                            {orientation.tall > 0 ? ` · воздух +${orientation.tall}` : ''}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {props.length > 0 && (
                            <div className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
                                {props.map((prop, i) => {
                                    const spec = propSpec(propTypes, prop.type);
                                    const dirs = spec ? propDirs(spec) : [];

                                    return (
                                        <div key={prop.id} className="flex items-center gap-1.5 text-xs">
                                            <span className="flex-1 truncate">{spec?.label ?? prop.type}</span>
                                            {/* поворот показываем, только когда есть из чего выбирать */}
                                            {spec && dirs.length > 1 && (
                                                <Select value={prop.dir ?? 'south'} onValueChange={(v) => rotateProp(i, v as PropDir)}>
                                                    <SelectTrigger className="h-7 w-28 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {dirs.map((dir) => (
                                                            <SelectItem key={dir} value={dir}>
                                                                {PROP_DIR_LABEL[dir]}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <CoordInput
                                                label="x"
                                                value={prop.x}
                                                max={width - 1}
                                                onChange={(v) => setProps((p) => p.map((o, j) => (j === i ? { ...o, x: v } : o)))}
                                            />
                                            <CoordInput
                                                label="y"
                                                value={prop.y}
                                                max={height - 1}
                                                onChange={(v) => setProps((p) => p.map((o, j) => (j === i ? { ...o, y: v } : o)))}
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-6"
                                                onClick={() => setProps((p) => p.filter((_, j) => j !== i))}
                                            >
                                                <Trash2 className="size-3" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <ListEditor
                        title="Объекты 📌"
                        onAdd={() =>
                            setObjects((prev) => [
                                ...prev,
                                {
                                    id: `obj-${prev.length + 1}-${Date.now()}`,
                                    type: 'board',
                                    label: 'Новый объект',
                                    url: 'https://example.com',
                                    x: spawn.x,
                                    y: spawn.y,
                                },
                            ])
                        }
                    >
                        {objects.map((obj, i) => (
                            <div
                                key={obj.id}
                                className="border-sidebar-border/70 dark:border-sidebar-border grid grid-cols-[1fr_auto] gap-1.5 rounded-lg border p-2"
                            >
                                <Input
                                    className="h-7 text-xs"
                                    value={obj.label}
                                    onChange={(e) => setObjects((p) => p.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))}
                                />
                                <Button size="icon" variant="ghost" className="size-7" onClick={() => setObjects((p) => p.filter((_, j) => j !== i))}>
                                    <Trash2 className="size-3.5" />
                                </Button>
                                <Input
                                    className="col-span-2 h-7 text-xs"
                                    value={obj.url}
                                    placeholder="https://…"
                                    onChange={(e) => setObjects((p) => p.map((o, j) => (j === i ? { ...o, url: e.target.value } : o)))}
                                />
                                <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                                    <Select
                                        value={obj.type}
                                        onValueChange={(v) =>
                                            setObjects((p) => p.map((o, j) => (j === i ? { ...o, type: v as MapObjectData['type'] } : o)))
                                        }
                                    >
                                        <SelectTrigger className="h-7 flex-1 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OBJECT_TYPES.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <CoordInput
                                        label="x"
                                        value={obj.x}
                                        max={width - 1}
                                        onChange={(v) => setObjects((p) => p.map((o, j) => (j === i ? { ...o, x: v } : o)))}
                                    />
                                    <CoordInput
                                        label="y"
                                        value={obj.y}
                                        max={height - 1}
                                        onChange={(v) => setObjects((p) => p.map((o, j) => (j === i ? { ...o, y: v } : o)))}
                                    />
                                </div>
                            </div>
                        ))}
                    </ListEditor>

                    <ListEditor
                        title="Порталы 🌀"
                        onAdd={() =>
                            setPortals((prev) => [
                                ...prev,
                                { x: spawn.x, y: spawn.y, to: rooms[0]?.slug ?? room.slug, label: 'Портал', tx: 1, ty: 1 },
                            ])
                        }
                    >
                        {portals.map((portal, i) => (
                            <div
                                key={i}
                                className="border-sidebar-border/70 dark:border-sidebar-border grid grid-cols-[1fr_auto] gap-1.5 rounded-lg border p-2"
                            >
                                <Input
                                    className="h-7 text-xs"
                                    value={portal.label}
                                    onChange={(e) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))}
                                />
                                <Button size="icon" variant="ghost" className="size-7" onClick={() => setPortals((p) => p.filter((_, j) => j !== i))}>
                                    <Trash2 className="size-3.5" />
                                </Button>
                                <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                                    <span className="text-muted-foreground text-xs">в</span>
                                    <Select
                                        value={portal.to}
                                        onValueChange={(v) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, to: v } : o)))}
                                    >
                                        <SelectTrigger className="h-7 flex-1 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {rooms.map((r) => (
                                                <SelectItem key={r.slug} value={r.slug}>
                                                    {r.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                                    <span className="text-muted-foreground text-xs">здесь</span>
                                    <CoordInput
                                        label="x"
                                        value={portal.x}
                                        max={width - 1}
                                        onChange={(v) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, x: v } : o)))}
                                    />
                                    <CoordInput
                                        label="y"
                                        value={portal.y}
                                        max={height - 1}
                                        onChange={(v) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, y: v } : o)))}
                                    />
                                    <span className="text-muted-foreground text-xs">→</span>
                                    <CoordInput
                                        label="tx"
                                        value={portal.tx}
                                        max={MAX_MAP_SIZE}
                                        onChange={(v) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, tx: v } : o)))}
                                    />
                                    <CoordInput
                                        label="ty"
                                        value={portal.ty}
                                        max={MAX_MAP_SIZE}
                                        onChange={(v) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, ty: v } : o)))}
                                    />
                                </div>
                            </div>
                        ))}
                    </ListEditor>

                    {errors.length > 0 && (
                        <div className="text-destructive space-y-1 text-xs">
                            {errors.map((e, i) => (
                                <p key={i}>{e}</p>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button className="flex-1" onClick={save} disabled={saving}>
                            <Save className="size-4" />
                            {saving ? 'Сохраняю…' : 'Сохранить'}
                        </Button>
                        <Button variant="outline" onClick={() => router.visit(`/rooms/${room.slug}`)}>
                            Отмена
                        </Button>
                    </div>

                    <p className="text-muted-foreground text-xs">
                        Карта сохраняется в базу. Чтобы правка пережила пересоздание базы, выгрузите её в репозиторий:{' '}
                        <code>php artisan voffice:export</code>
                    </p>
                </div>
            </div>
        </AppLayout>
    );
}

function ListEditor({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
    return (
        <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
            <div className="mb-2 flex items-center">
                <h3 className="text-sm font-semibold">{title}</h3>
                <Button size="sm" variant="outline" className="ml-auto h-7" onClick={onAdd}>
                    <Plus className="size-3.5" />
                    Добавить
                </Button>
            </div>
            <div className="flex flex-col gap-2">{children}</div>
        </div>
    );
}

function CoordInput({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
    return (
        <label className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Input
                type="number"
                min={0}
                max={max}
                value={value}
                onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
                className="h-7 w-14 px-1.5 text-xs"
            />
        </label>
    );
}
