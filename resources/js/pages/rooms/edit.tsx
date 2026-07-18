import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fillRect, MAX_MAP_SIZE, resizeRows, setTile, TILE_CHARS, type MapData, type MapObjectData, type PortalData } from '@/game/map';
import { TILE_COLOR, TILE_LABEL } from '@/game/tile-colors';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Hand, Plus, Save, Square, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RoomInfo {
    id: number;
    slug: string;
    name: string;
    map: MapData;
}

interface EditProps extends SharedData {
    room: RoomInfo;
    rooms: { slug: string; name: string }[];
}

type Tool = 'paint' | 'rect' | 'spawn' | 'pan';

const OBJECT_TYPES = [
    { value: 'board', label: 'Доска' },
    { value: 'video', label: 'Видео' },
    { value: 'map', label: 'Карта' },
    { value: 'link', label: 'Ссылка' },
] as const;

// масштабы: от обзора всей большой карты до комфортного рисования
const ZOOM_LEVELS = [3, 5, 8, 12, 16, 22, 32];

export default function RoomEdit() {
    const { room, rooms } = usePage<EditProps>().props;

    const [name, setName] = useState(room.name);
    // строки карты как есть: правка одной строки вместо копирования всей сетки
    const [rows, setRows] = useState<string[]>(room.map.rows);
    const [spawn, setSpawn] = useState(room.map.spawn);
    const [objects, setObjects] = useState<MapObjectData[]>(room.map.objects);
    const [portals, setPortals] = useState<PortalData[]>(room.map.portals);
    const [tool, setTool] = useState<Tool>('paint');
    const [brush, setBrush] = useState<string>('.');
    const [zoom, setZoom] = useState(5); // индекс в ZOOM_LEVELS
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
    const [rectPreview, setRectPreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [sizeDraft, setSizeDraft] = useState({ w: room.map.rows[0].length, h: room.map.rows.length });

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 560 });
    const drag = useRef<{ mode: 'paint' | 'rect' | 'pan'; startX: number; startY: number; panX: number; panY: number } | null>(null);

    const cell = ZOOM_LEVELS[zoom];
    const width = rows[0]?.length ?? 0;
    const height = rows.length;

    // канвас занимает контейнер; на большой карте это окно, а не вся карта
    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        const apply = () => {
            const rect = host.getBoundingClientRect();
            setCanvasSize({ width: Math.max(320, Math.round(rect.width)), height: Math.max(240, Math.round(rect.height)) });
        };
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    const toTile = useCallback(
        (clientX: number, clientY: number) => {
            const canvas = canvasRef.current;
            if (!canvas) {
                return null;
            }
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((clientX - rect.left + pan.x) / cell);
            const y = Math.floor((clientY - rect.top + pan.y) / cell);
            return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
        },
        [cell, pan, width, height],
    );

    // отрисовка: только видимые клетки, поэтому размер карты не влияет на скорость
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            return;
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = canvasSize.width * dpr;
        canvas.height = canvasSize.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = '#37323f';
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

        const x0 = Math.max(0, Math.floor(pan.x / cell));
        const y0 = Math.max(0, Math.floor(pan.y / cell));
        const x1 = Math.min(width - 1, Math.ceil((pan.x + canvasSize.width) / cell));
        const y1 = Math.min(height - 1, Math.ceil((pan.y + canvasSize.height) / cell));

        for (let y = y0; y <= y1; y++) {
            const row = rows[y];
            for (let x = x0; x <= x1; x++) {
                ctx.fillStyle = TILE_COLOR[row[x]] ?? '#000';
                ctx.fillRect(Math.round(x * cell - pan.x), Math.round(y * cell - pan.y), cell, cell);
            }
        }

        // сетка — только когда клетки достаточно крупные
        if (cell >= 12) {
            ctx.strokeStyle = 'rgba(0,0,0,0.07)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = x0; x <= x1 + 1; x++) {
                const px = Math.round(x * cell - pan.x) + 0.5;
                ctx.moveTo(px, 0);
                ctx.lineTo(px, canvasSize.height);
            }
            for (let y = y0; y <= y1 + 1; y++) {
                const py = Math.round(y * cell - pan.y) + 0.5;
                ctx.moveTo(0, py);
                ctx.lineTo(canvasSize.width, py);
            }
            ctx.stroke();
        }

        // маркеры рисуются обходом самих массивов — без поиска по каждой клетке
        const marker = (x: number, y: number, glyph: string) => {
            if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) {
                return;
            }
            ctx.font = `${Math.max(8, Math.min(cell, 20))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, x * cell - pan.x + cell / 2, y * cell - pan.y + cell / 2);
        };
        for (const portal of portals) {
            marker(portal.x, portal.y, '🌀');
        }
        for (const obj of objects) {
            marker(obj.x, obj.y, '📌');
        }
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.strokeRect(spawn.x * cell - pan.x + 1, spawn.y * cell - pan.y + 1, cell - 2, cell - 2);
        marker(spawn.x, spawn.y, '⚑');

        // предпросмотр прямоугольника
        if (rectPreview) {
            const left = Math.min(rectPreview.x0, rectPreview.x1);
            const top = Math.min(rectPreview.y0, rectPreview.y1);
            const w = Math.abs(rectPreview.x1 - rectPreview.x0) + 1;
            const h = Math.abs(rectPreview.y1 - rectPreview.y0) + 1;
            ctx.fillStyle = 'rgba(255, 201, 20, 0.35)';
            ctx.fillRect(left * cell - pan.x, top * cell - pan.y, w * cell, h * cell);
            ctx.strokeStyle = '#ffc914';
            ctx.strokeRect(left * cell - pan.x, top * cell - pan.y, w * cell, h * cell);
        }
    }, [rows, spawn, objects, portals, cell, pan, canvasSize, rectPreview, width, height]);

    const applyTile = (x: number, y: number) => {
        if (tool === 'spawn') {
            setSpawn({ x, y });
            return;
        }
        setRows((prev) => setTile(prev, x, y, brush));
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            // указателя может не быть (синтетические события) — рисованию не мешает
        }
        // средняя кнопка или инструмент «рука» — панорамирование
        if (e.button === 1 || tool === 'pan') {
            drag.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
            return;
        }
        const tile = toTile(e.clientX, e.clientY);
        if (!tile) {
            return;
        }
        if (tool === 'rect') {
            drag.current = { mode: 'rect', startX: tile.x, startY: tile.y, panX: 0, panY: 0 };
            setRectPreview({ x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y });
            return;
        }
        drag.current = { mode: 'paint', startX: tile.x, startY: tile.y, panX: 0, panY: 0 };
        applyTile(tile.x, tile.y);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const state = drag.current;
        if (state?.mode === 'pan') {
            setPan({
                x: clampPan(state.panX - (e.clientX - state.startX), width * cell, canvasSize.width),
                y: clampPan(state.panY - (e.clientY - state.startY), height * cell, canvasSize.height),
            });
            return;
        }

        const tile = toTile(e.clientX, e.clientY);
        setHover(tile);
        if (!tile || !state) {
            return;
        }
        if (state.mode === 'rect') {
            setRectPreview({ x0: state.startX, y0: state.startY, x1: tile.x, y1: tile.y });
        } else if (state.mode === 'paint') {
            applyTile(tile.x, tile.y);
        }
    };

    const onPointerUp = () => {
        const state = drag.current;
        if (state?.mode === 'rect' && rectPreview) {
            setRows((prev) => fillRect(prev, rectPreview.x0, rectPreview.y0, rectPreview.x1, rectPreview.y1, brush));
        }
        setRectPreview(null);
        drag.current = null;
    };

    const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoom + (e.deltaY > 0 ? -1 : 1)));
        if (next === zoom) {
            return;
        }
        // сохраняем точку под курсором на месте
        const rect = e.currentTarget.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const worldX = (pan.x + cursorX) / cell;
        const worldY = (pan.y + cursorY) / cell;
        const nextCell = ZOOM_LEVELS[next];
        setZoom(next);
        setPan({
            x: clampPan(worldX * nextCell - cursorX, width * nextCell, canvasSize.width),
            y: clampPan(worldY * nextCell - cursorY, height * nextCell, canvasSize.height),
        });
    };

    const applyResize = () => {
        const w = Math.max(3, Math.min(MAX_MAP_SIZE, sizeDraft.w));
        const h = Math.max(3, Math.min(MAX_MAP_SIZE, sizeDraft.h));
        setRows((prev) => resizeRows(prev, w, h));
        setSpawn((prev) => ({ x: Math.min(prev.x, w - 2), y: Math.min(prev.y, h - 2) }));
        setObjects((prev) => prev.filter((o) => o.x < w && o.y < h));
        setPortals((prev) => prev.filter((p) => p.x < w && p.y < h));
        setSizeDraft({ w, h });
    };

    const save = () => {
        setSaving(true);
        setErrors([]);
        const map: MapData = { rows, spawn, zones: room.map.zones, objects, portals };
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
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {/* канвас — абсолютный слой: иначе его явная ширина раздувает
                        разметку, которую мы же и измеряем (петля обратной связи) */}
                    <div
                        ref={hostRef}
                        className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[420px] w-full flex-1 overflow-hidden rounded-xl border"
                    >
                        <canvas
                            ref={canvasRef}
                            style={{ touchAction: 'none' }}
                            className={`absolute inset-0 h-full w-full ${tool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerLeave={() => {
                                setHover(null);
                                onPointerUp();
                            }}
                            onWheel={onWheel}
                            onContextMenu={(e) => e.preventDefault()}
                        />
                    </div>
                    {/* строка статуса заменяет per-cell тултипы, которых нет у канваса */}
                    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                        <span>
                            Карта {width}×{height}
                        </span>
                        {hover && (
                            <span>
                                ({hover.x}, {hover.y}) — {TILE_LABEL[rows[hover.y][hover.x]] ?? rows[hover.y][hover.x]}
                            </span>
                        )}
                        <span className="ml-auto">Колесо — зум · средняя кнопка или «рука» — сдвиг</span>
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
                            <Button size="sm" variant={tool === 'pan' ? 'default' : 'outline'} onClick={() => setTool('pan')}>
                                <Hand className="size-3.5" />
                            </Button>
                            <span className="ml-auto flex items-center gap-1">
                                <Button size="icon" variant="outline" className="size-8" onClick={() => setZoom((z) => Math.max(0, z - 1))}>
                                    <ZoomOut className="size-3.5" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="size-8"
                                    onClick={() => setZoom((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
                                >
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
                </div>
            </div>
        </AppLayout>
    );
}

function clampPan(value: number, contentPx: number, viewportPx: number): number {
    const max = Math.max(0, contentPx - viewportPx);
    return Math.max(0, Math.min(max, value));
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
