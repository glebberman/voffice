import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { CoordInput } from '@/components/editor/CoordInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PropData } from '@/game/map';
import { PROP_DIR_LABEL, propDirs, propOrientation, propSpec, type PropCatalogue, type PropDir } from '@/game/props';
import type { Tool } from '@/hooks/use-map-editor';
import { Trash2 } from 'lucide-react';

/**
 * Палитра предметов каталога (выбор → инструмент «предмет») и список
 * расставленных: поворот (если сторон больше одной), координаты, удаление.
 */
export function PropsPanel({
    props,
    catalogue,
    propType,
    tool,
    width,
    height,
    onPick,
    onRotate,
    onChange,
}: {
    props: PropData[];
    catalogue: PropCatalogue;
    propType: string;
    tool: Tool;
    width: number;
    height: number;
    onPick: (type: string) => void;
    onRotate: (i: number, dir: PropDir) => void;
    onChange: (next: PropData[]) => void;
}) {
    const patch = (i: number, p: Partial<PropData>) => onChange(props.map((o, j) => (j === i ? { ...o, ...p } : o)));

    return (
        <CollapsiblePanel title="Предметы 🪑" count={props.length}>
            <p className="text-muted-foreground mb-2 text-xs">
                Выберите предмет и кликните по карте. Основание блокирует проход, часть в воздухе — нет: за ней можно пройти.{' '}
                <a href="/props" className="underline">
                    Каталог предметов
                </a>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
                {Object.keys(catalogue).map((type) => {
                    const spec = catalogue[type];
                    const orientation = spec ? propOrientation(spec) : null;
                    if (!spec || !orientation) {
                        return null;
                    }
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => onPick(type)}
                            className={`rounded-md border px-2 py-1 text-left text-xs ${propType === type && tool === 'prop' ? 'ring-primary ring-2' : ''}`}
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
                        const spec = propSpec(catalogue, prop.type);
                        const dirs = spec ? propDirs(spec) : [];
                        return (
                            <div key={prop.id} className="flex items-center gap-1.5 text-xs">
                                <span className="flex-1 truncate">{spec?.label ?? prop.type}</span>
                                {/* поворот показываем, только когда есть из чего выбирать */}
                                {spec && dirs.length > 1 && (
                                    <Select value={prop.dir ?? 'south'} onValueChange={(v) => onRotate(i, v as PropDir)}>
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
                                <CoordInput label="x" value={prop.x} max={width - 1} onChange={(v) => patch(i, { x: v })} />
                                <CoordInput label="y" value={prop.y} max={height - 1} onChange={(v) => patch(i, { y: v })} />
                                <Button size="icon" variant="ghost" className="size-6" onClick={() => onChange(props.filter((_, j) => j !== i))}>
                                    <Trash2 className="size-3" />
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </CollapsiblePanel>
    );
}
