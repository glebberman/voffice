import { BehaviorSettings } from '@/components/editor/behavior-settings';
import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { CoordInput } from '@/components/editor/CoordInput';
import { PropThumbnail } from '@/components/editor/PropThumbnail';
import { Button } from '@/components/ui/button';
import type { PropData } from '@/game/map';
import { PROP_DIR_LABEL, propDirs, propFits, propOrientation, propSpec, withState, type PropCatalogue, type PropDir } from '@/game/props';
import { Trash2, X } from 'lucide-react';

/**
 * Настройки выделенного предмета: превью, поворот (если сторон больше одной),
 * координаты, удаление. Открывается при установке предмета и при клике по
 * стоящему (см. use-map-editor: placeAt и инструмент «Выделение»). Формы
 * поведений подключатся через BehaviorSettings на этапе C.
 */
export function PropSettingsPanel({
    prop,
    index,
    catalogue,
    width,
    height,
    onRotate,
    onPatch,
    onRemove,
    onDeselect,
}: {
    prop: PropData;
    index: number;
    catalogue: PropCatalogue;
    width: number;
    height: number;
    onRotate: (i: number, dir: PropDir) => void;
    onPatch: (i: number, patch: Partial<PropData>) => void;
    onRemove: (i: number) => void;
    onDeselect: () => void;
}) {
    const spec = propSpec(catalogue, prop.type);
    const orientation = spec ? propOrientation(spec, prop.dir) : null;
    const dirs = spec ? propDirs(spec) : [];
    const currentDir = prop.dir ?? 'south';
    // состояния — общие для сторон типа; показываем как справку (живое
    // переключение приедет в игре с prop_states)
    const states = orientation ? Object.keys(orientation.states ?? {}) : [];

    return (
        <CollapsiblePanel title={`Настройки: ${spec?.label ?? prop.type} ⚙️`}>
            {spec && orientation ? (
                <>
                    <div className="mb-2 flex items-start gap-2">
                        <span className="bg-muted/40 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded">
                            <PropThumbnail orientation={withState(orientation, spec.defaultState)} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{spec.label}</p>
                            {spec.description ? <p className="text-muted-foreground text-[11px]">{spec.description}</p> : null}
                            <p className="text-muted-foreground mt-0.5 text-[10px]">
                                Основание {orientation.w}×{orientation.h}
                                {orientation.tall > 0 ? ` · воздух +${orientation.tall}` : ''}
                            </p>
                        </div>
                        <Button size="icon" variant="ghost" className="size-7" title="Снять выделение" onClick={onDeselect}>
                            <X className="size-3.5" />
                        </Button>
                    </div>

                    {dirs.length > 1 && (
                        <div className="mb-2">
                            <p className="text-muted-foreground mb-1 text-xs">Поворот</p>
                            <div className="flex flex-wrap gap-1">
                                {dirs.map((dir) => {
                                    // поворот меняет footprint — если новая сторона не влезает на
                                    // текущем месте, rotateProp промолчит; гасим кнопку, чтобы это было видно
                                    const o = propOrientation(spec, dir);
                                    const fits = dir === currentDir || (o !== null && propFits(o, prop.x, prop.y, width, height));
                                    return (
                                        <button
                                            key={dir}
                                            type="button"
                                            disabled={!fits}
                                            title={fits ? undefined : 'не помещается на этом месте'}
                                            onClick={() => onRotate(index, dir)}
                                            className={`rounded-md border px-2 py-1 text-[11px] disabled:opacity-40 ${currentDir === dir ? 'ring-primary ring-2' : ''}`}
                                        >
                                            {PROP_DIR_LABEL[dir]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {states.length > 0 && (
                        <p className="text-muted-foreground mb-2 text-[11px]">
                            Состояния: {states.join(' · ')}
                            {spec.defaultState ? ` (по умолчанию ${spec.defaultState})` : ''} — переключаются в игре.
                        </p>
                    )}

                    <div className="mb-2">
                        <p className="text-muted-foreground mb-1 text-xs">Положение (левый верхний угол основания)</p>
                        <div className="flex items-center gap-1.5">
                            <CoordInput label="x" value={prop.x} max={width - 1} onChange={(v) => onPatch(index, { x: v })} />
                            <CoordInput label="y" value={prop.y} max={height - 1} onChange={(v) => onPatch(index, { y: v })} />
                        </div>
                    </div>

                    {/* слот форм поведений (embed/switchable) — приедет на этапе C */}
                    <BehaviorSettings />
                </>
            ) : (
                <p className="text-muted-foreground mb-2 text-xs">Тип «{prop.type}» не найден в каталоге — предмет можно только удалить.</p>
            )}

            <Button size="sm" variant="destructive" className="mt-1 h-7 w-full" onClick={() => onRemove(index)}>
                <Trash2 className="size-3.5" />
                Удалить предмет
            </Button>
        </CollapsiblePanel>
    );
}
