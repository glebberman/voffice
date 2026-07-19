import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { propSheetUrl, type PropSpec } from '@/game/props';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const TILE = 32;
const ZOOM = 3; // лист мелкий, без увеличения по нему не попасть мышью

interface PropTypeRow extends PropSpec {
    id: number;
    slug: string;
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
    sheet: string;
    sx: number;
    sy: number;
    w: number;
    h: number;
    tall: number;
}

const emptyDraft = (sheet: string): Draft => ({ slug: '', label: '', sheet, sx: 0, sy: 0, w: 1, h: 1, tall: 0 });

const draftOf = (type: PropTypeRow): Draft => ({
    slug: type.slug,
    label: type.label,
    sheet: type.sheet,
    sx: type.sx,
    sy: type.sy,
    w: type.w,
    h: type.h,
    tall: type.tall,
});

/** Превью предмета прямо из листа спрайтов — без канваса, одним div-ом. */
function PropPreview({ spec, fit }: { spec: PropSpec; fit?: number }) {
    const width = spec.w * TILE;
    const height = (spec.h + spec.tall) * TILE;
    // fit — сторона квадрата, в который нужно вписать: список ужимает крупные
    // предметы, а карточка правки показывает их в натуральную величину
    const scale = fit ? Math.min(1, fit / Math.max(width, height)) : 1;

    return (
        <div className="shrink-0" style={{ width: width * scale, height: height * scale }}>
            <div
                style={{
                    width,
                    height,
                    backgroundImage: `url("${propSheetUrl(spec)}")`,
                    backgroundPosition: `-${spec.sx}px -${spec.sy}px`,
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

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    // что тянем мышью: рамку региона или границу «воздух / основание»
    const dragRef = useRef<{ mode: 'region' | 'divider'; anchorX: number; anchorY: number } | null>(null);

    const total = draft.h + draft.tall; // высота региона в тайлах

    const select = (type: PropTypeRow) => {
        setSelectedId(type.id);
        setDraft(draftOf(type));
    };

    const startNew = () => {
        setSelectedId(null);
        setDraft(emptyDraft(draft.sheet || sheets[0] || ''));
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

    // лист спрайтов грузим один раз на смену выбора
    const sheet = draft.sheet;
    useEffect(() => {
        if (!sheet) {
            return;
        }
        const img = new Image();
        img.src = propSheetUrl({ sheet });
        img.onload = () => {
            imageRef.current = img;
            setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        };
        return () => {
            img.onload = null;
        };
    }, [sheet]);

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !imageSize.width) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        canvas.width = imageSize.width * ZOOM;
        canvas.height = imageSize.height * ZOOM;

        // шахматка — чтобы прозрачные части листа были видны
        const cell = 8;
        for (let y = 0; y < canvas.height; y += cell) {
            for (let x = 0; x < canvas.width; x += cell) {
                ctx.fillStyle = (x / cell + y / cell) % 2 === 0 ? '#f4f4f5' : '#e4e4e7';
                ctx.fillRect(x, y, cell, cell);
            }
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // сетка тайлов
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= imageSize.width; x += TILE) {
            ctx.beginPath();
            ctx.moveTo(x * ZOOM + 0.5, 0);
            ctx.lineTo(x * ZOOM + 0.5, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= imageSize.height; y += TILE) {
            ctx.beginPath();
            ctx.moveTo(0, y * ZOOM + 0.5);
            ctx.lineTo(canvas.width, y * ZOOM + 0.5);
            ctx.stroke();
        }

        // затемняем всё, что вне региона
        const rx = draft.sx * ZOOM;
        const ry = draft.sy * ZOOM;
        const rw = draft.w * TILE * ZOOM;
        const rh = total * TILE * ZOOM;
        ctx.fillStyle = 'rgba(24,24,27,0.55)';
        ctx.fillRect(0, 0, canvas.width, ry);
        ctx.fillRect(0, ry + rh, canvas.width, canvas.height - ry - rh);
        ctx.fillRect(0, ry, rx, rh);
        ctx.fillRect(rx + rw, ry, canvas.width - rx - rw, rh);

        // висящая в воздухе часть — синим, основание — зелёным
        const tallH = draft.tall * TILE * ZOOM;
        if (tallH > 0) {
            ctx.fillStyle = 'rgba(59,130,246,0.18)';
            ctx.fillRect(rx, ry, rw, tallH);
        }
        ctx.fillStyle = 'rgba(34,197,94,0.18)';
        ctx.fillRect(rx, ry + tallH, rw, rh - tallH);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

        // граница «воздух / основание» — её и тянут мышью
        if (draft.tall > 0) {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(rx, ry + tallH);
            ctx.lineTo(rx + rw, ry + tallH);
            ctx.stroke();
        }
    }, [draft, imageSize, total]);

    useEffect(redraw, [redraw]);

    /**
     * Координаты события в системе листа спрайтов. Канвас на странице может
     * быть растянут (девайс-пиксели, зум браузера), поэтому масштаб берём из
     * его реального размера, а не из ZOOM.
     */
    const tileAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const perPixel = rect.width / canvas.width; // экранных px на один px канваса
        const px = (e.clientX - rect.left) / perPixel / ZOOM;
        const py = (e.clientY - rect.top) / perPixel / ZOOM;

        return { x: Math.floor(px / TILE), y: Math.floor(py / TILE), py };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const { x, y, py } = tileAt(e);
        e.currentTarget.setPointerCapture(e.pointerId);

        // клик у самой границы внутри региона — тянем её, а не рисуем новый регион
        const dividerY = draft.sy + draft.tall * TILE;
        const insideX = x >= draft.sx / TILE && x < draft.sx / TILE + draft.w;
        const insideY = py >= draft.sy && py <= draft.sy + total * TILE;
        if (insideX && insideY && Math.abs(py - dividerY) <= 6 && total > 1) {
            dragRef.current = { mode: 'divider', anchorX: x, anchorY: y };
            return;
        }

        dragRef.current = { mode: 'region', anchorX: x, anchorY: y };
        setDraft((d) => ({ ...d, sx: x * TILE, sy: y * TILE, w: 1, h: 1, tall: 0 }));
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragRef.current;
        if (!drag) {
            return;
        }
        const { x, y, py } = tileAt(e);

        if (drag.mode === 'divider') {
            // граница ходит по тайлам внутри региона; основание — минимум 1 тайл
            const rows = Math.round((py - draft.sy) / TILE);
            setDraft((d) => ({ ...d, tall: Math.max(0, Math.min(total - 1, rows)), h: total - Math.max(0, Math.min(total - 1, rows)) }));
            return;
        }

        const left = Math.min(drag.anchorX, x);
        const top = Math.min(drag.anchorY, y);
        setDraft((d) => ({
            ...d,
            sx: left * TILE,
            sy: top * TILE,
            w: Math.abs(x - drag.anchorX) + 1,
            h: Math.abs(y - drag.anchorY) + 1 - d.tall,
            tall: d.tall,
        }));
    };

    const onPointerUp = () => {
        dragRef.current = null;
    };

    const submit = () => {
        if (selectedId === null) {
            router.post('/props', { ...draft }, { preserveScroll: true });
        } else {
            router.put(`/props/${selectedId}`, { ...draft }, { preserveScroll: true });
        }
    };

    const remove = (type: PropTypeRow) => {
        router.delete(`/props/${type.id}`, { preserveScroll: true });
    };

    const errorList = Object.values(errors);

    return (
        <AppLayout breadcrumbs={[{ title: 'Каталог предметов', href: '/props' }]}>
            <Head title="Каталог предметов" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 lg:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Select value={draft.sheet} onValueChange={(sheet) => setDraft((d) => ({ ...d, sheet, sx: 0, sy: 0, w: 1, h: 1, tall: 0 }))}>
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

                    <div className="border-sidebar-border/70 dark:border-sidebar-border min-h-0 flex-1 overflow-auto rounded-xl border p-2">
                        <canvas
                            ref={canvasRef}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            className="touch-none select-none"
                            style={{ cursor: 'crosshair' }}
                        />
                    </div>

                    <div className="text-muted-foreground flex items-center gap-4 text-xs">
                        <span>
                            Регион {draft.sx},{draft.sy} · {draft.w}×{total} тайлов
                        </span>
                        <span className="text-green-600 dark:text-green-500">
                            Основание {draft.w}×{draft.h}
                        </span>
                        <span className="text-blue-600 dark:text-blue-400">В воздухе +{draft.tall}</span>
                    </div>
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
                                {draft.sheet && <PropPreview spec={draft} fit={96} />}
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

                        <Button className="mt-3 w-full" size="sm" onClick={submit} disabled={!draft.label || !draft.slug || !draft.sheet}>
                            <Save className="size-3.5" />
                            {selectedId === null ? 'Добавить в каталог' : 'Сохранить'}
                        </Button>
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <div className="mb-2 flex items-center">
                            <h3 className="text-sm font-semibold">Предметы</h3>
                            <span className="text-muted-foreground ml-auto text-xs">{types.length} шт.</span>
                        </div>
                        <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
                            {types.map((type) => (
                                <div
                                    key={type.id}
                                    className={`flex items-center gap-2 rounded-md border p-1.5 text-xs ${
                                        type.id === selectedId ? 'ring-primary ring-2' : ''
                                    }`}
                                >
                                    <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => select(type)}>
                                        <div className="flex size-10 shrink-0 items-center justify-center">
                                            <PropPreview spec={type} fit={40} />
                                        </div>
                                        <span className="min-w-0">
                                            <span className="block truncate">{type.label}</span>
                                            <span className="text-muted-foreground">
                                                {type.w}×{type.h}
                                                {type.tall > 0 ? ` · воздух +${type.tall}` : ''}
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
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
