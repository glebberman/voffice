import { OrientationTabs } from '@/components/props-editor/OrientationTabs';
import { SheetCropper } from '@/components/props-editor/SheetCropper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROP_DIRS, propSheetUrl, type PropDir, type PropOrientation } from '@/game/props';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const TILE = 32;

interface OrientationRow extends PropOrientation {
    dir: PropDir;
}

interface PropTypeRow {
    id: number;
    slug: string;
    label: string;
    orientations: OrientationRow[];
}

interface PropsPageProps extends SharedData {
    types: PropTypeRow[];
    sheets: string[];
    usage: Record<string, number>;
    errors: Record<string, string>;
}

interface Draft {
    slug: string;
    label: string;
    orientations: OrientationRow[];
}

/** Вкладки держим в каноническом порядке сторон, как каталог и экспорт. */
const byDir = (a: OrientationRow, b: OrientationRow): number => PROP_DIRS.indexOf(a.dir) - PROP_DIRS.indexOf(b.dir);

const emptyDraft = (sheet: string): Draft => ({
    slug: '',
    label: '',
    orientations: [{ dir: 'south', sheet, sx: 0, sy: 0, w: 1, h: 1, tall: 0 }],
});

const draftOf = (type: PropTypeRow): Draft => ({
    slug: type.slug,
    label: type.label,
    orientations: type.orientations.map((o) => ({ ...o })),
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
    const { types, sheets, usage, errors } = usePage<PropsPageProps>().props;

    const [selectedId, setSelectedId] = useState<number | null>(types[0]?.id ?? null);
    const [draft, setDraft] = useState<Draft>(types[0] ? draftOf(types[0]) : emptyDraft(sheets[0] ?? ''));
    const [activeDir, setActiveDir] = useState<PropDir>(types[0]?.orientations.at(0)?.dir ?? 'south');

    // активная сторона: инвариант «activeDir существует» поддерживают все
    // обработчики ниже, фолбэк — на случай пустого типа с сервера
    const active = draft.orientations.find((o) => o.dir === activeDir) ?? draft.orientations.at(0);

    const select = (type: PropTypeRow) => {
        setSelectedId(type.id);
        setDraft(draftOf(type));
        setActiveDir(type.orientations.at(0)?.dir ?? 'south');
    };

    const startNew = () => {
        setSelectedId(null);
        setDraft(emptyDraft(active?.sheet ?? sheets.at(0) ?? ''));
        setActiveDir('south');
    };

    // После создания типа страница перезагружается списком с сервера —
    // подхватываем новый тип, иначе форма осталась бы «новой» с занятым ключом.
    useEffect(() => {
        if (selectedId === null) {
            const created = types.find((t) => t.slug === draft.slug);
            if (created) {
                setSelectedId(created.id);
            }
        }
    }, [types, selectedId, draft.slug]);

    const patchOrientation = (dir: PropDir, patch: Partial<OrientationRow>) => {
        setDraft((d) => ({ ...d, orientations: d.orientations.map((o) => (o.dir === dir ? { ...o, ...patch } : o)) }));
    };

    // новая сторона начинается копией активной: обычно у ракурсов один лист,
    // и отличается только регион
    const addDir = (dir: PropDir) => {
        setDraft((d) => {
            const base = d.orientations.find((o) => o.dir === activeDir) ?? d.orientations.at(0);
            const clone: OrientationRow = base ? { ...base, dir } : { dir, sheet: sheets[0] ?? '', sx: 0, sy: 0, w: 1, h: 1, tall: 0 };
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
            orientations: draft.orientations.map((o) => ({ dir: o.dir, sheet: o.sheet, sx: o.sx, sy: o.sy, w: o.w, h: o.h, tall: o.tall })),
        };
        if (selectedId === null) {
            router.post('/props', payload, { preserveScroll: true });
        } else {
            router.put(`/props/${selectedId}`, payload, { preserveScroll: true });
        }
    };

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
                            value={active?.sheet ?? ''}
                            onValueChange={(sheet) => {
                                if (active) {
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

                    {active && <SheetCropper sheet={active.sheet} value={active} onChange={(region) => patchOrientation(active.dir, region)} />}
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
                                {active?.sheet ? <PropPreview orientation={active} fit={96} /> : null}
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

                        <Button className="mt-3 w-full" size="sm" onClick={submit} disabled={incomplete}>
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
                </div>
            </div>
        </AppLayout>
    );
}
