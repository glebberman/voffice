import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { PropThumbnail } from '@/components/editor/PropThumbnail';
import { Button } from '@/components/ui/button';
import type { PropData } from '@/game/map';
import { PROP_DIR_LABEL, propDirs, propOrientation, propSpec, withState, type PropCatalogue } from '@/game/props';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

export type CatalogueAxis = 'purpose' | 'room';

export interface PropCategoryInfo {
    axis: CatalogueAxis;
    slug: string;
    label: string;
}

const AXIS_TABS: { axis: CatalogueAxis; label: string }[] = [
    { axis: 'purpose', label: 'По назначению' },
    { axis: 'room', label: 'По типу помещения' },
];

/** Слоги предмета по оси группировки. */
function slugsOf(catalogue: PropCatalogue, type: string, axis: CatalogueAxis): string[] {
    const spec = catalogue[type];
    return (axis === 'purpose' ? spec?.purposes : spec?.roomKinds) ?? [];
}

/**
 * Каталог предметов: карточки с превью и описанием, группировка по двум осям
 * (как в Sims — предмет может попасть в несколько групп). Клик по карточке
 * «берёт» предмет на курсор (см. хук: дальше клик по полю ставит, R — поворот,
 * перенос кладёт на отпускании). Ниже — список расставленных для навигации:
 * клик выделяет предмет (правится он в панели настроек), крестик удаляет.
 */
export function CataloguePanel({
    catalogue,
    categories,
    props,
    placingType,
    selected,
    onPick,
    onSelect,
    onRemove,
}: {
    catalogue: PropCatalogue;
    categories: PropCategoryInfo[];
    props: PropData[];
    placingType: string | null;
    selected: number | null;
    onPick: (type: string) => void;
    onSelect: (i: number | null) => void;
    onRemove: (i: number) => void;
}) {
    const [axis, setAxis] = useState<CatalogueAxis>('purpose');

    const types = Object.keys(catalogue);
    const axisCats = categories.filter((c) => c.axis === axis);
    const groups: { key: string; label: string; types: string[] }[] = [];
    for (const cat of axisCats) {
        const inCat = types.filter((t) => slugsOf(catalogue, t, axis).includes(cat.slug));
        if (inCat.length > 0) {
            groups.push({ key: cat.slug, label: cat.label, types: inCat });
        }
    }
    // предмет без единой категории этой оси (или с осиротевшим слогом) — в «Прочее»
    const rest = types.filter((t) => !slugsOf(catalogue, t, axis).some((s) => axisCats.some((c) => c.slug === s)));
    if (rest.length > 0) {
        groups.push({ key: '__rest__', label: 'Прочее', types: rest });
    }

    return (
        <CollapsiblePanel title="Предметы 🪑" count={props.length}>
            <p className="text-muted-foreground mb-2 text-xs">
                Кликните предмет и поставьте на карту (или перетащите). <b>R</b> — повернуть, <b>Delete</b> — удалить выделенный.{' '}
                <a href="/props" className="underline">
                    Каталог
                </a>
            </p>

            <div className="mb-3 flex gap-1">
                {AXIS_TABS.map((t) => (
                    <button
                        key={t.axis}
                        type="button"
                        onClick={() => setAxis(t.axis)}
                        className={`flex-1 rounded-md border px-2 py-1 text-[11px] ${axis === t.axis ? 'ring-primary ring-2' : ''}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-3">
                {groups.map((group) => (
                    <div key={group.key}>
                        <h4 className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">{group.label}</h4>
                        <div className="grid grid-cols-2 gap-1.5">
                            {group.types.map((type) => {
                                const spec = catalogue[type];
                                const orientation = spec ? propOrientation(spec) : null;
                                if (!spec || !orientation) {
                                    return null;
                                }
                                const view = withState(orientation, spec.defaultState);
                                return (
                                    <button
                                        key={`${group.key}:${type}`}
                                        type="button"
                                        // берём на курсор по pointerdown — так работает и клик, и перетаскивание
                                        onPointerDown={() => onPick(type)}
                                        className={`flex flex-col gap-1 rounded-md border p-1.5 text-left ${placingType === type ? 'ring-primary ring-2' : ''}`}
                                    >
                                        <span className="bg-muted/40 flex h-14 items-center justify-center overflow-hidden rounded">
                                            <PropThumbnail orientation={view} />
                                        </span>
                                        <span className="truncate text-xs font-medium">{spec.label}</span>
                                        {spec.description ? (
                                            <span className="text-muted-foreground line-clamp-2 text-[11px]">{spec.description}</span>
                                        ) : null}
                                        <span className="text-muted-foreground text-[10px]">
                                            {orientation.w}×{orientation.h}
                                            {orientation.tall > 0 ? ` · воздух +${orientation.tall}` : ''}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {props.length > 0 && (
                <div className="mt-3 flex max-h-52 flex-col gap-0.5 overflow-y-auto border-t pt-2">
                    {props.map((prop, i) => {
                        const spec = propSpec(catalogue, prop.type);
                        const rotatable = spec ? propDirs(spec).length > 1 : false;
                        return (
                            <div
                                key={prop.id}
                                onClick={() => onSelect(i)}
                                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs ${
                                    selected === i ? 'ring-primary ring-2' : 'hover:bg-muted/50'
                                }`}
                            >
                                <span className="flex-1 truncate">{spec?.label ?? prop.type}</span>
                                <span className="text-muted-foreground shrink-0 text-[10px]">
                                    {rotatable ? `${PROP_DIR_LABEL[prop.dir ?? 'south']} · ` : ''}
                                    {prop.x},{prop.y}
                                </span>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-6 shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(i);
                                    }}
                                >
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
