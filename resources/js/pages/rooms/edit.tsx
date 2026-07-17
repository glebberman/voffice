import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TILE_CHARS, type MapData, type MapObjectData, type PortalData } from '@/game/map';
import { TILE_COLOR, TILE_LABEL } from '@/game/tile-colors';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Save, Trash2 } from 'lucide-react';
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
}

type Tool = 'paint' | 'spawn';

const OBJECT_TYPES = [
    { value: 'board', label: 'Доска' },
    { value: 'video', label: 'Видео' },
    { value: 'map', label: 'Карта' },
    { value: 'link', label: 'Ссылка' },
] as const;

const CELL = 22;

export default function RoomEdit() {
    const { room, rooms } = usePage<EditProps>().props;

    const [name, setName] = useState(room.name);
    // строки карты как массив массивов символов — удобно править точечно
    const [grid, setGrid] = useState<string[][]>(() => room.map.rows.map((r) => r.split('')));
    const [spawn, setSpawn] = useState(room.map.spawn);
    const [objects, setObjects] = useState<MapObjectData[]>(room.map.objects);
    const [portals, setPortals] = useState<PortalData[]>(room.map.portals);
    const [tool, setTool] = useState<Tool>('paint');
    const [brush, setBrush] = useState<string>('.');
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const painting = useRef(false);

    const width = grid[0]?.length ?? 0;
    const height = grid.length;

    const applyCell = (x: number, y: number) => {
        if (tool === 'spawn') {
            setSpawn({ x, y });
            return;
        }
        setGrid((prev) => {
            if (prev[y][x] === brush) {
                return prev;
            }
            const next = prev.map((row) => [...row]);
            next[y][x] = brush;
            return next;
        });
    };

    const save = () => {
        setSaving(true);
        setErrors([]);
        const map: MapData = {
            rows: grid.map((row) => row.join('')),
            spawn,
            zones: room.map.zones,
            objects,
            portals,
        };
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
                <div className="min-w-0 flex-1 overflow-auto">
                    <div
                        className="w-fit select-none"
                        style={{ display: 'grid', gridTemplateColumns: `repeat(${width}, ${CELL}px)` }}
                        onPointerLeave={() => (painting.current = false)}
                        onPointerUp={() => (painting.current = false)}
                    >
                        {grid.map((row, y) =>
                            row.map((ch, x) => {
                                const isSpawn = spawn.x === x && spawn.y === y;
                                const obj = objects.find((o) => o.x === x && o.y === y);
                                const portal = portals.find((p) => p.x === x && p.y === y);
                                return (
                                    <button
                                        key={`${x}-${y}`}
                                        type="button"
                                        title={`(${x}, ${y}) ${TILE_LABEL[ch] ?? ch}`}
                                        onPointerDown={() => {
                                            painting.current = true;
                                            applyCell(x, y);
                                        }}
                                        onPointerEnter={() => painting.current && applyCell(x, y)}
                                        className="flex items-center justify-center text-[11px] leading-none"
                                        style={{
                                            width: CELL,
                                            height: CELL,
                                            background: TILE_COLOR[ch] ?? '#000',
                                            outline: isSpawn ? '2px solid #22c55e' : undefined,
                                            outlineOffset: -2,
                                        }}
                                    >
                                        {portal ? '🌀' : obj ? '📌' : isSpawn ? '⚑' : ''}
                                    </button>
                                );
                            }),
                        )}
                    </div>
                </div>

                <div className="flex w-full flex-col gap-4 lg:w-96">
                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <Label className="mb-1.5 block">Название комнаты</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-3 flex gap-1">
                            <Button size="sm" variant={tool === 'paint' ? 'default' : 'outline'} onClick={() => setTool('paint')}>
                                Рисовать
                            </Button>
                            <Button size="sm" variant={tool === 'spawn' ? 'default' : 'outline'} onClick={() => setTool('spawn')}>
                                Спавн ⚑
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {TILE_CHARS.map((ch) => (
                                <button
                                    key={ch}
                                    type="button"
                                    onClick={() => {
                                        setBrush(ch);
                                        setTool('paint');
                                    }}
                                    className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${
                                        tool === 'paint' && brush === ch ? 'ring-primary ring-2' : ''
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
                                <div className="col-span-2 flex items-center gap-1.5">
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
                                <div className="col-span-2 flex items-center gap-1.5">
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
                                <div className="col-span-2 flex items-center gap-1.5">
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
                                        max={999}
                                        onChange={(v) => setPortals((p) => p.map((o, j) => (j === i ? { ...o, tx: v } : o)))}
                                    />
                                    <CoordInput
                                        label="ty"
                                        value={portal.ty}
                                        max={999}
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
