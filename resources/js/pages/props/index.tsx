import { AXES, CategoryManager, type CategoryRow } from '@/components/props-editor/CategoryManager';
import { InteractionZoneGrid } from '@/components/props-editor/InteractionZoneGrid';
import { OrientationTabs } from '@/components/props-editor/OrientationTabs';
import { SheetCropper } from '@/components/props-editor/SheetCropper';
import { StateTabs } from '@/components/props-editor/StateTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROP_BEHAVIOR_LABEL, PROP_BEHAVIORS, type PropBehavior } from '@/game/behaviors';
import { PROP_DIRS, propSheetUrl, withState, type PropCell, type PropDir, type PropOrientation, type PropStateRegion } from '@/game/props';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const TILE = 32;

interface OrientationRow extends PropOrientation {
    dir: PropDir;
    states: Partial<Record<string, PropStateRegion>>; // в черновике всегда есть, хотя бы пустые
    interaction: PropCell[]; // в черновике всегда есть, хотя бы пустой
}

interface PropTypeRow {
    id: number;
    slug: string;
    label: string;
    description: string;
    defaultState: string | null;
    behavior: PropBehavior | null;
    categoryIds: number[];
    orientations: OrientationRow[];
}

interface PropsPageProps extends SharedData {
    types: PropTypeRow[];
    categories: CategoryRow[];
    sheets: string[];
    usage: Record<string, number>;
    errors: Record<string, string>;
}

interface Draft {
    slug: string;
    label: string;
    description: string;
    defaultState: string | null;
    behavior: PropBehavior | null;
    categoryIds: number[];
    orientations: OrientationRow[];
}

/** Вкладки держим в каноническом порядке сторон, как каталог и экспорт. */
const byDir = (a: OrientationRow, b: OrientationRow): number => PROP_DIRS.indexOf(a.dir) - PROP_DIRS.indexOf(b.dir);

const emptyDraft = (sheet: string): Draft => ({
    slug: '',
    label: '',
    description: '',
    defaultState: null,
    behavior: null,
    categoryIds: [],
    orientations: [{ dir: 'south', sheet, sx: 0, sy: 0, w: 1, h: 1, tall: 0, states: {}, interaction: [] }],
});

const draftOf = (type: PropTypeRow): Draft => ({
    slug: type.slug,
    label: type.label,
    description: type.description,
    defaultState: type.defaultState,
    behavior: type.behavior,
    categoryIds: [...type.categoryIds],
    orientations: type.orientations.map((o) => ({ ...o, states: { ...o.states }, interaction: [...o.interaction] })),
});

/** Превью предмета прямо из листа спрайтов — без канваса, одним div-ом. */
function PropPreview({ orientation, fit }: { orientation: PropOrientation; fit?: number }) {
    const width = orientation.w * TILE;
    const height = (orientation.h + orientation.tall) * TILE;
    // fit — сторона квадрата, в который нужно вписать: список ужимает крупные
    // предметы, а карточка правки показывает их в натуральную величину
    const scale = fit ? Math.min(1, fit / Math.max(width, height)) : 1;

    return (
        <div className="shrink-0" style={{ width: width * scale, height: height * scale }}>
            <div
                style={{
                    width,
                    height,
                    backgroundImage: `url("${propSheetUrl(orientation)}")`,
                    backgroundPosition: `-${orientation.sx}px -${orientation.sy}px`,
                    imageRendering: 'pixelated',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            />
        </div>
    );
}

export default function PropsCatalogue() {
    const { types, categories, sheets, usage, errors } = usePage<PropsPageProps>().props;

    const [selectedId, setSelectedId] = useState<number | null>(types[0]?.id ?? null);
    const [draft, setDraft] = useState<Draft>(types[0] ? draftOf(types[0]) : emptyDraft(sheets[0] ?? ''));
    const [activeDir, setActiveDir] = useState<PropDir>(types[0]?.orientations.at(0)?.dir ?? 'south');
    // какой регион правит кроппер: null — базовый регион ориентации, иначе имя состояния
    const [activeState, setActiveState] = useState<string | null>(null);

    // активная сторона: инвариант «activeDir существует» поддерживают все
    // обработчики ниже, фолбэк — на случай пустого типа с сервера
    const active = draft.orientations.find((o) => o.dir === activeDir) ?? draft.orientations.at(0);

    // имена состояний общие для всех сторон — берём с первой
    const stateNames = Object.keys(draft.orientations.at(0)?.states ?? {}).sort();
    const stateRegion = active && activeState !== null ? active.states[activeState] : undefined;

    // Ключ, который мы только что отправили на создание. Подхватываем новый тип
    // из свежего списка ТОЛЬКО по успешному POST: искать по набранному в форме
    // ключу нельзя — введённый вручную занятый slug молча переключил бы форму на
    // чужой предмет, и «Сохранить» перезаписало бы его черновиком.
    const [createdSlug, setCreatedSlug] = useState<string | null>(null);
    // запрос в полёте: второй клик по «Добавить в каталог» прервал бы первый,
    // и предмет создался бы, а форма осталась бы «новой» с ошибкой уникальности
    const [busy, setBusy] = useState(false);

    const select = (type: PropTypeRow) => {
        setSelectedId(type.id);
        setDraft(draftOf(type));
        setActiveDir(type.orientations.at(0)?.dir ?? 'south');
        setActiveState(null);
        setCreatedSlug(null); // ушли с формы создания — перехватывать нечего
    };

    const startNew = () => {
        setSelectedId(null);
        setDraft(emptyDraft(active?.sheet ?? sheets.at(0) ?? ''));
        setActiveDir('south');
        setActiveState(null);
        setCreatedSlug(null);
    };

    // После создания страница перезагружается списком с сервера — иначе форма
    // осталась бы «новой» с уже занятым ключом. Берём тип целиком: серверная
    // версия отличается от черновика (сортировка клеток зоны, порядок состояний).
    useEffect(() => {
        if (createdSlug === null) {
            return;
        }
        const created = types.find((t) => t.slug === createdSlug);
        if (created) {
            select(created);
        }
    }, [types, createdSlug]);

    // Выбранного типа не стало (удалили здесь или в соседней вкладке) — форма
    // правит несуществующий id, и «Сохранить» ушло бы в PUT с 404.
    useEffect(() => {
        if (selectedId !== null && !types.some((t) => t.id === selectedId)) {
            startNew();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [types, selectedId]);

    const patchOrientation = (dir: PropDir, patch: Partial<OrientationRow>) => {
        setDraft((d) => ({ ...d, orientations: d.orientations.map((o) => (o.dir === dir ? { ...o, ...patch } : o)) }));
    };

    const patchStateRegion = (dir: PropDir, name: string, region: PropStateRegion) => {
        setDraft((d) => ({
            ...d,
            orientations: d.orientations.map((o) => (o.dir === dir ? { ...o, states: { ...o.states, [name]: region } } : o)),
        }));
    };

    // Состояние добавляется сразу всем сторонам (имена общие для типа), регион
    // начинается копией базового — обычно отличается только угол на листе.
    // Первое состояние сразу становится дефолтным.
    const addState = (name: string) => {
        setDraft((d) => ({
            ...d,
            defaultState: d.defaultState ?? name,
            orientations: d.orientations.map((o) => ({ ...o, states: { ...o.states, [name]: { sheet: o.sheet, sx: o.sx, sy: o.sy } } })),
        }));
        setActiveState(name);
    };

    const removeState = (name: string) => {
        const rest = stateNames.filter((n) => n !== name);
        setDraft((d) => ({
            ...d,
            defaultState: d.defaultState === name ? (rest.at(0) ?? null) : d.defaultState,
            orientations: d.orientations.map((o) => ({
                ...o,
                states: Object.fromEntries(Object.entries(o.states).filter(([n]) => n !== name)),
            })),
        }));
        if (activeState === name) {
            setActiveState(null);
        }
    };

    // новая сторона начинается копией активной: обычно у ракурсов один лист,
    // и отличается только регион
    const addDir = (dir: PropDir) => {
        setDraft((d) => {
            const base = d.orientations.find((o) => o.dir === activeDir) ?? d.orientations.at(0);
            const clone: OrientationRow = base
                ? { ...base, dir, states: { ...base.states }, interaction: [...base.interaction] }
                : { dir, sheet: sheets[0] ?? '', sx: 0, sy: 0, w: 1, h: 1, tall: 0, states: {}, interaction: [] };
            return { ...d, orientations: [...d.orientations, clone].sort(byDir) };
        });
        setActiveDir(dir);
    };

    const removeDir = (dir: PropDir) => {
        const rest = draft.orientations.filter((o) => o.dir !== dir);
        const first = rest.at(0);
        if (!first) {
            return; // последнюю сторону не удаляем — у предмета обязана быть хотя бы одна
        }
        setDraft((d) => ({ ...d, orientations: d.orientations.filter((o) => o.dir !== dir) }));
        if (dir === activeDir) {
            setActiveDir(first.dir);
        }
    };

    const submit = () => {
        // сервер ждёт полный набор ориентаций: чего нет в запросе, того у типа больше нет
        const payload = {
            slug: draft.slug,
            label: draft.label,
            description: draft.description,
            categoryIds: draft.categoryIds,
            defaultState: draft.defaultState,
            behavior: draft.behavior,
            orientations: draft.orientations.map((o) => ({
                dir: o.dir,
                sheet: o.sheet,
                sx: o.sx,
                sy: o.sy,
                w: o.w,
                h: o.h,
                tall: o.tall,
                states: Object.entries(o.states).flatMap(([name, region]) =>
                    region ? [{ name, sheet: region.sheet, sx: region.sx, sy: region.sy }] : [],
                ),
                interaction: o.interaction,
            })),
        };
        setBusy(true);
        const done = { preserveScroll: true, onFinish: () => setBusy(false) };
        if (selectedId === null) {
            router.post('/props', payload, { ...done, onSuccess: () => setCreatedSlug(payload.slug) });
        } else {
            router.put(`/props/${selectedId}`, payload, done);
        }
    };

    // форму, которая правит удалённый тип, вернёт в «Новый предмет» эффект выше
    const remove = (type: PropTypeRow) => {
        router.delete(`/props/${type.id}`, { preserveScroll: true });
    };

    const errorList = Object.values(errors);
    const incomplete = !draft.label || !draft.slug || draft.orientations.some((o) => !o.sheet);

    return (
        <AppLayout breadcrumbs={[{ title: 'Каталог предметов', href: '/props' }]}>
            <Head title="Каталог предметов" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 lg:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Select
                            value={stateRegion ? stateRegion.sheet : (active?.sheet ?? '')}
                            onValueChange={(sheet) => {
                                if (!active) {
                                    return;
                                }
                                // при выбранном состоянии меняется его лист, не базовый
                                if (activeState !== null && stateRegion) {
                                    patchStateRegion(active.dir, activeState, { sheet, sx: 0, sy: 0 });
                                } else {
                                    patchOrientation(active.dir, { sheet, sx: 0, sy: 0, w: 1, h: 1, tall: 0 });
                                }
                            }}
                        >
                            <SelectTrigger className="w-[320px]">
                                <SelectValue placeholder="Лист спрайтов" />
                            </SelectTrigger>
                            <SelectContent>
                                {sheets.map((sheet) => (
                                    <SelectItem key={sheet} value={sheet}>
                                        {sheet}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">
                            Протяните рамку по спрайту, затем тяните оранжевую линию — выше неё предмет висит в воздухе (за ним ходят), ниже —
                            основание (блокирует проход).
                        </p>
                    </div>

                    {/* стороны предмета: у каждой свой лист, регион и геометрия */}
                    <OrientationTabs
                        dirs={draft.orientations.map((o) => o.dir)}
                        active={active?.dir ?? 'south'}
                        onSelect={setActiveDir}
                        onAdd={addDir}
                        onRemove={removeDir}
                    />

                    <StateTabs
                        names={stateNames}
                        active={activeState}
                        defaultState={draft.defaultState}
                        onSelect={setActiveState}
                        onAdd={addState}
                        onRemove={removeState}
                        onDefault={(name) => setDraft((d) => ({ ...d, defaultState: name }))}
                    />

                    {active && (
                        <SheetCropper
                            sheet={stateRegion ? stateRegion.sheet : active.sheet}
                            value={stateRegion ? { sx: stateRegion.sx, sy: stateRegion.sy, w: active.w, h: active.h, tall: active.tall } : active}
                            fixedSize={stateRegion !== undefined}
                            onChange={(region) => {
                                if (activeState !== null && stateRegion) {
                                    patchStateRegion(active.dir, activeState, { sheet: stateRegion.sheet, sx: region.sx, sy: region.sy });
                                } else {
                                    patchOrientation(active.dir, region);
                                }
                            }}
                        />
                    )}

                    {/* зона взаимодействия активной стороны — своя на каждую ориентацию */}
                    {active && (
                        <InteractionZoneGrid
                            orientation={active}
                            cells={active.interaction}
                            onChange={(interaction) => patchOrientation(active.dir, { interaction })}
                        />
                    )}
                </div>

                <div className="flex w-full flex-col gap-4 lg:w-96">
                    {errorList.length > 0 && (
                        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                            {errorList.map((e) => (
                                <p key={e}>{e}</p>
                            ))}
                        </div>
                    )}

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-3 flex items-center">
                            <h3 className="text-sm font-semibold">{selectedId === null ? 'Новый предмет' : 'Правка предмета'}</h3>
                            <Button size="sm" variant="outline" className="ml-auto" onClick={startNew}>
                                <Plus className="size-3.5" />
                                Новый
                            </Button>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="border-sidebar-border/70 dark:border-sidebar-border flex items-center justify-center rounded-md border p-2">
                                {/* превью показывает то, что правится: активное состояние или дефолт */}
                                {active?.sheet ? <PropPreview orientation={withState(active, activeState ?? draft.defaultState)} fit={96} /> : null}
                            </div>
                            <div className="flex-1 space-y-2">
                                <div>
                                    <Label className="text-xs">Название</Label>
                                    <Input
                                        className="h-8"
                                        value={draft.label}
                                        onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                                        placeholder="Шкаф (высокий)"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Ключ в картах</Label>
                                    <Input
                                        className="h-8 font-mono text-xs"
                                        value={draft.slug}
                                        onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                                        placeholder="cabinet"
                                        disabled={selectedId !== null && (usage[draft.slug] ?? 0) > 0}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-2">
                            <Label className="text-xs">Описание для каталога</Label>
                            <textarea
                                className="border-input placeholder:text-muted-foreground mt-1 w-full rounded-md border bg-transparent px-3 py-1.5 text-xs shadow-xs outline-none"
                                rows={2}
                                value={draft.description}
                                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                                placeholder="Пара слов для карточки предмета"
                            />
                        </div>

                        {/* группировки, как в Sims: предмет может состоять в нескольких категориях каждой оси */}
                        {AXES.map(({ key, title }) => {
                            const ofAxis = categories.filter((c) => c.axis === key);
                            if (ofAxis.length === 0) {
                                return null;
                            }
                            return (
                                <div key={key} className="mt-2">
                                    <Label className="text-xs">{title}</Label>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {ofAxis.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() =>
                                                    setDraft((d) => ({
                                                        ...d,
                                                        categoryIds: d.categoryIds.includes(c.id)
                                                            ? d.categoryIds.filter((id) => id !== c.id)
                                                            : [...d.categoryIds, c.id],
                                                    }))
                                                }
                                                className={`rounded-md border px-1.5 py-0.5 text-[11px] ${
                                                    draft.categoryIds.includes(c.id) ? 'ring-primary ring-2' : 'text-muted-foreground'
                                                }`}
                                            >
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* поведение: как взаимодействуют с предметом в игре (embed — окно с URL) */}
                        <div className="mt-2">
                            <Label className="text-xs">Поведение</Label>
                            <Select
                                value={draft.behavior ?? 'none'}
                                onValueChange={(v) => setDraft((d) => ({ ...d, behavior: v === 'none' ? null : (v as PropBehavior) }))}
                            >
                                <SelectTrigger className="mt-1 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Обычная мебель</SelectItem>
                                    {PROP_BEHAVIORS.map((b) => (
                                        <SelectItem key={b} value={b}>
                                            {PROP_BEHAVIOR_LABEL[b]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {draft.behavior !== null && draft.orientations.some((o) => o.interaction.length === 0) && (
                                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                    У предмета с поведением нужна зона взаимодействия на каждой стороне.
                                </p>
                            )}
                        </div>

                        <Button className="mt-3 w-full" size="sm" onClick={submit} disabled={incomplete || busy}>
                            <Save className="size-3.5" />
                            {selectedId === null ? 'Добавить в каталог' : 'Сохранить'}
                        </Button>

                        <p className="text-muted-foreground mt-2 text-xs">
                            Каталог живёт в базе. Чтобы правка пережила пересоздание базы, выгрузите её в репозиторий:{' '}
                            <code>php artisan voffice:export</code>
                        </p>
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-2 flex items-center">
                            <h3 className="text-sm font-semibold">Предметы</h3>
                            <span className="text-muted-foreground ml-auto text-xs">{types.length} шт.</span>
                        </div>
                        <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
                            {types.map((type) => {
                                const first = type.orientations.at(0);

                                return (
                                    <div
                                        key={type.id}
                                        className={`flex items-center gap-2 rounded-md border p-1.5 text-xs ${
                                            type.id === selectedId ? 'ring-primary ring-2' : ''
                                        }`}
                                    >
                                        <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => select(type)}>
                                            <div className="flex size-10 shrink-0 items-center justify-center">
                                                {first && <PropPreview orientation={first} fit={40} />}
                                            </div>
                                            <span className="min-w-0">
                                                <span className="block truncate">{type.label}</span>
                                                <span className="text-muted-foreground">
                                                    {first ? `${first.w}×${first.h}` : '—'}
                                                    {first && first.tall > 0 ? ` · воздух +${first.tall}` : ''}
                                                    {type.orientations.length > 1 ? ` · сторон: ${type.orientations.length}` : ''}
                                                    {usage[type.slug] ? ` · на картах ${usage[type.slug]}` : ''}
                                                </span>
                                            </span>
                                        </button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-6"
                                            title={usage[type.slug] ? 'Используется на картах' : 'Удалить'}
                                            disabled={!!usage[type.slug]}
                                            onClick={() => remove(type)}
                                        >
                                            <Trash2 className="size-3" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <CategoryManager categories={categories} />
                </div>
            </div>
        </AppLayout>
    );
}
