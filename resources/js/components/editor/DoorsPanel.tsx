import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { CoordInput } from '@/components/editor/CoordInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCK_SIDE_LABEL, LOCK_SIDES, type DoorData, type LockSide } from '@/game/map';
import { Trash2 } from 'lucide-react';

/** Список дверей: координаты, сторона замка, удаление. */
export function DoorsPanel({
    doors,
    width,
    height,
    onChange,
}: {
    doors: DoorData[];
    width: number;
    height: number;
    onChange: (next: DoorData[]) => void;
}) {
    const patch = (i: number, p: Partial<DoorData>) => onChange(doors.map((o, j) => (j === i ? { ...o, ...p } : o)));

    return (
        <CollapsiblePanel title="Двери 🚪" count={doors.length}>
            <p className="text-muted-foreground mb-2 text-xs">
                Инструмент «Дверь» ставит её на проходимую клетку — обычно в проём стены. Закрытая дверь не пропускает и прячет всё, до чего без неё
                не добраться. Замок можно повернуть только с той стороны, где он висит.
            </p>
            {doors.length > 0 && (
                <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {doors.map((d, i) => (
                        <div key={d.id} className="flex items-center gap-1.5 text-xs">
                            <CoordInput label="x" value={d.x} max={width - 1} onChange={(v) => patch(i, { x: v })} />
                            <CoordInput label="y" value={d.y} max={height - 1} onChange={(v) => patch(i, { y: v })} />
                            <Select value={d.lock ?? 'none'} onValueChange={(v) => patch(i, { lock: v === 'none' ? null : (v as LockSide) })}>
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
                            <Button size="icon" variant="ghost" className="size-6" onClick={() => onChange(doors.filter((_, j) => j !== i))}>
                                <Trash2 className="size-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </CollapsiblePanel>
    );
}
