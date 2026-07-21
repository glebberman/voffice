import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { CoordInput } from '@/components/editor/CoordInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_MAP_SIZE, type PortalData } from '@/game/map';
import { Plus, Trash2 } from 'lucide-react';

/** Порталы: подпись, целевая комната, клетка здесь и клетка прибытия. */
export function PortalsPanel({
    portals,
    rooms,
    spawn,
    fallbackSlug,
    width,
    height,
    onChange,
}: {
    portals: PortalData[];
    rooms: { slug: string; name: string }[];
    spawn: { x: number; y: number };
    fallbackSlug: string;
    width: number;
    height: number;
    onChange: (next: PortalData[]) => void;
}) {
    const patch = (i: number, p: Partial<PortalData>) => onChange(portals.map((o, j) => (j === i ? { ...o, ...p } : o)));
    const add = () => onChange([...portals, { x: spawn.x, y: spawn.y, to: rooms[0]?.slug ?? fallbackSlug, label: 'Портал', tx: 1, ty: 1 }]);

    return (
        <CollapsiblePanel title="Порталы 🌀" count={portals.length}>
            <Button size="sm" variant="outline" className="mb-2 h-7" onClick={add}>
                <Plus className="size-3.5" />
                Добавить
            </Button>
            <div className="flex flex-col gap-2">
                {portals.map((portal, i) => (
                    <div
                        key={i}
                        className="border-sidebar-border/70 dark:border-sidebar-border grid grid-cols-[1fr_auto] gap-1.5 rounded-lg border p-2"
                    >
                        <Input className="h-7 text-xs" value={portal.label} onChange={(e) => patch(i, { label: e.target.value })} />
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => onChange(portals.filter((_, j) => j !== i))}>
                            <Trash2 className="size-3.5" />
                        </Button>
                        <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground text-xs">в</span>
                            <Select value={portal.to} onValueChange={(v) => patch(i, { to: v })}>
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
                            <CoordInput label="x" value={portal.x} max={width - 1} onChange={(v) => patch(i, { x: v })} />
                            <CoordInput label="y" value={portal.y} max={height - 1} onChange={(v) => patch(i, { y: v })} />
                            <span className="text-muted-foreground text-xs">→</span>
                            <CoordInput label="tx" value={portal.tx} max={MAX_MAP_SIZE} onChange={(v) => patch(i, { tx: v })} />
                            <CoordInput label="ty" value={portal.ty} max={MAX_MAP_SIZE} onChange={(v) => patch(i, { ty: v })} />
                        </div>
                    </div>
                ))}
            </div>
        </CollapsiblePanel>
    );
}
