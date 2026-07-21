import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { CoordInput } from '@/components/editor/CoordInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MapObjectData } from '@/game/map';
import { Plus, Trash2 } from 'lucide-react';

const OBJECT_TYPES = [
    { value: 'board', label: 'Доска' },
    { value: 'video', label: 'Видео' },
    { value: 'map', label: 'Карта' },
    { value: 'link', label: 'Ссылка' },
] as const;

/** Интерактивные объекты (доска/видео/карта/ссылка): подпись, URL, тип, координаты. */
export function ObjectsPanel({
    objects,
    spawn,
    width,
    height,
    onChange,
}: {
    objects: MapObjectData[];
    spawn: { x: number; y: number };
    width: number;
    height: number;
    onChange: (next: MapObjectData[]) => void;
}) {
    const patch = (i: number, p: Partial<MapObjectData>) => onChange(objects.map((o, j) => (j === i ? { ...o, ...p } : o)));
    const add = () =>
        onChange([
            ...objects,
            {
                id: `obj-${objects.length + 1}-${Date.now()}`,
                type: 'board',
                label: 'Новый объект',
                url: 'https://example.com',
                x: spawn.x,
                y: spawn.y,
            },
        ]);

    return (
        <CollapsiblePanel title="Объекты 📌" count={objects.length}>
            <Button size="sm" variant="outline" className="mb-2 h-7" onClick={add}>
                <Plus className="size-3.5" />
                Добавить
            </Button>
            <div className="flex flex-col gap-2">
                {objects.map((obj, i) => (
                    <div
                        key={obj.id}
                        className="border-sidebar-border/70 dark:border-sidebar-border grid grid-cols-[1fr_auto] gap-1.5 rounded-lg border p-2"
                    >
                        <Input className="h-7 text-xs" value={obj.label} onChange={(e) => patch(i, { label: e.target.value })} />
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => onChange(objects.filter((_, j) => j !== i))}>
                            <Trash2 className="size-3.5" />
                        </Button>
                        <Input
                            className="col-span-2 h-7 text-xs"
                            value={obj.url}
                            placeholder="https://…"
                            onChange={(e) => patch(i, { url: e.target.value })}
                        />
                        <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                            <Select value={obj.type} onValueChange={(v) => patch(i, { type: v as MapObjectData['type'] })}>
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
                            <CoordInput label="x" value={obj.x} max={width - 1} onChange={(v) => patch(i, { x: v })} />
                            <CoordInput label="y" value={obj.y} max={height - 1} onChange={(v) => patch(i, { y: v })} />
                        </div>
                    </div>
                ))}
            </div>
        </CollapsiblePanel>
    );
}
