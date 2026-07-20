import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { router } from '@inertiajs/react';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export interface CategoryRow {
    id: number;
    axis: string; // purpose | room
    slug: string;
    label: string;
}

export const AXES = [
    { key: 'purpose', title: 'Назначение' },
    { key: 'room', title: 'Тип помещения' },
] as const;

const SLUG_RE = /^[a-z0-9-]+$/;

function AxisColumn({ axis, title, rows }: { axis: string; title: string; rows: CategoryRow[] }) {
    const [slug, setSlug] = useState('');
    const [label, setLabel] = useState('');
    const valid = SLUG_RE.test(slug) && label.trim() !== '' && !rows.some((r) => r.slug === slug);

    const add = () => {
        if (!valid) {
            return;
        }
        router.post('/prop-categories', { axis, slug, label: label.trim() }, { preserveScroll: true });
        setSlug('');
        setLabel('');
    };

    return (
        <div className="flex-1 space-y-1.5">
            <h4 className="text-xs font-semibold">{title}</h4>
            {rows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                    {/* переименование: неуправляемый инпут, сохранение по уходу фокуса */}
                    <Input
                        className="h-7 text-xs"
                        defaultValue={row.label}
                        onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== row.label) {
                                router.put(`/prop-categories/${row.id}`, { axis: row.axis, slug: row.slug, label: next }, { preserveScroll: true });
                            }
                        }}
                    />
                    <span className="text-muted-foreground w-20 truncate font-mono text-[10px]">{row.slug}</span>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        title="Удалить категорию (предметы просто отвяжутся)"
                        onClick={() => router.delete(`/prop-categories/${row.id}`, { preserveScroll: true })}
                    >
                        <Trash2 className="size-3" />
                    </Button>
                </div>
            ))}
            <div className="flex items-center gap-1.5">
                <Input className="h-7 w-24 font-mono text-xs" placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
                <Input className="h-7 flex-1 text-xs" placeholder="Название" value={label} onChange={(e) => setLabel(e.target.value)} />
                <Button size="icon" variant="outline" className="size-7" disabled={!valid} onClick={add} title="Добавить категорию">
                    <Plus className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}

/**
 * Категории каталога: две редактируемые оси группировки, как в Sims. Сами
 * категории — просто ярлыки, поэтому удаление не блокируется использованием.
 */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
    return (
        <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
            <h3 className="mb-1 text-sm font-semibold">Категории каталога</h3>
            <p className="text-muted-foreground mb-3 text-xs">
                Оси группировки для каталога предметов в редакторе карт. Предмет может состоять в нескольких категориях каждой оси.
            </p>
            <div className="flex gap-4">
                {AXES.map(({ key, title }) => (
                    <AxisColumn key={key} axis={key} title={title} rows={categories.filter((c) => c.axis === key)} />
                ))}
            </div>
        </div>
    );
}
