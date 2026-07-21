import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { CoordInput } from '@/components/editor/CoordInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZONE_PRESETS, zoneColorCss } from '@/editor/zone-presets';
import type { Zone } from '@/game/map';
import type { Tool } from '@/hooks/use-map-editor';
import { Trash2 } from 'lucide-react';

/**
 * Области карты (помещения): выбор пресета включает инструмент «Область» —
 * обведите прямоугольник по полю. Список зон правится вручную; клик по строке
 * подсвечивает зону на поле.
 */
export function ZonesPanel({
    zones,
    selected,
    zoneKind,
    tool,
    width,
    height,
    onPickPreset,
    onSelect,
    onChange,
}: {
    zones: Zone[];
    selected: number | null;
    zoneKind: string;
    tool: Tool;
    width: number;
    height: number;
    onPickPreset: (kind: string) => void;
    onSelect: (i: number | null) => void;
    onChange: (next: Zone[]) => void;
}) {
    const patch = (i: number, p: Partial<Zone>) => onChange(zones.map((z, j) => (j === i ? { ...z, ...p } : z)));

    // правка угла держит прямоугольник невырожденным (x2>=x1, y2>=y1),
    // иначе оверлей рисуется наизнанку, а сервер такую зону не примет
    const setCorner = (i: number, key: 'x1' | 'y1' | 'x2' | 'y2', v: number) => {
        const z = zones[i];
        const next = { ...z, [key]: v };
        if (next.x2 < next.x1) {
            if (key === 'x1') next.x1 = next.x2;
            else next.x2 = next.x1;
        }
        if (next.y2 < next.y1) {
            if (key === 'y1') next.y1 = next.y2;
            else next.y2 = next.y1;
        }
        patch(i, next);
    };

    const remove = (i: number) => {
        onChange(zones.filter((_, j) => j !== i));
        // после удаления индексы сдвигаются: выбранную выше по списку сдвигаем,
        // саму удалённую — снимаем
        if (selected === i) {
            onSelect(null);
        } else if (selected !== null && selected > i) {
            onSelect(selected - 1);
        }
    };

    return (
        <CollapsiblePanel title="Области 🗺️" count={zones.length}>
            <p className="text-muted-foreground mb-2 text-xs">
                Выберите тип и обведите прямоугольник на карте. Приватная зона (переговорка) не выпускает чат за стены.
            </p>
            <div className="mb-3 flex flex-wrap gap-1">
                {ZONE_PRESETS.map((preset) => (
                    <button
                        key={preset.kind}
                        type="button"
                        onClick={() => onPickPreset(preset.kind)}
                        className={`flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] ${
                            tool === 'zone' && zoneKind === preset.kind ? 'ring-primary ring-2' : ''
                        }`}
                    >
                        <span className="size-3 shrink-0 rounded-sm" style={{ background: zoneColorCss(preset.color) }} />
                        {preset.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-2">
                {zones.map((zone, i) => (
                    <div
                        key={i}
                        onClick={() => onSelect(i)}
                        className={`border-sidebar-border/70 dark:border-sidebar-border grid cursor-pointer grid-cols-[1fr_auto] gap-1.5 rounded-lg border p-2 ${
                            selected === i ? 'ring-primary ring-2' : ''
                        }`}
                    >
                        <Input
                            className="h-7 text-xs"
                            value={zone.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => patch(i, { name: e.target.value })}
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={(e) => {
                                e.stopPropagation();
                                remove(i);
                            }}
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                        <div className="col-span-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <Select value={zone.kind ?? 'custom'} onValueChange={(v) => patch(i, { kind: v })}>
                                <SelectTrigger className="h-7 w-28 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ZONE_PRESETS.map((p) => (
                                        <SelectItem key={p.kind} value={p.kind}>
                                            {p.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <label className="flex items-center gap-1 text-xs">
                                <Checkbox checked={zone.isPrivate ?? false} onCheckedChange={(v) => patch(i, { isPrivate: v === true })} />
                                приватная
                            </label>
                        </div>
                        <div className="col-span-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <CoordInput label="x1" value={zone.x1} max={width - 1} onChange={(v) => setCorner(i, 'x1', v)} />
                            <CoordInput label="y1" value={zone.y1} max={height - 1} onChange={(v) => setCorner(i, 'y1', v)} />
                            <CoordInput label="x2" value={zone.x2} max={width - 1} onChange={(v) => setCorner(i, 'x2', v)} />
                            <CoordInput label="y2" value={zone.y2} max={height - 1} onChange={(v) => setCorner(i, 'y2', v)} />
                        </div>
                    </div>
                ))}
            </div>
        </CollapsiblePanel>
    );
}
