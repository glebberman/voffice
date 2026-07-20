import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

const NAME_RE = /^[a-z0-9-]+$/;

/**
 * Состояния предмета: «базовый» — регион самой ориентации, остальные чипы —
 * именованные регионы (телевизор включён / выключен). Имена общие для всех
 * сторон типа, поэтому добавление и удаление действуют сразу на все стороны —
 * этим управляет страница, здесь только выбор.
 */
export function StateTabs({
    names,
    active,
    defaultState,
    onSelect,
    onAdd,
    onRemove,
    onDefault,
}: {
    names: string[];
    active: string | null; // null — выбран базовый регион
    defaultState: string | null;
    onSelect: (name: string | null) => void;
    onAdd: (name: string) => void;
    onRemove: (name: string) => void;
    onDefault: (name: string) => void;
}) {
    const [draft, setDraft] = useState('');
    const valid = NAME_RE.test(draft) && !names.includes(draft);

    const add = () => {
        if (valid) {
            onAdd(draft);
            setDraft('');
        }
    };

    const chip = (label: string, isActive: boolean, onClick: () => void) => (
        <button
            key={label}
            type="button"
            onClick={onClick}
            className={`rounded-md border px-2 py-1 text-xs ${isActive ? 'ring-primary ring-2' : 'text-muted-foreground'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Состояния:</span>
            {chip('базовый', active === null, () => onSelect(null))}
            {names.map((name) => chip(name, active === name, () => onSelect(name)))}

            <Input
                className="h-7 w-28 font-mono text-xs"
                placeholder="on"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        add();
                    }
                }}
            />
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!valid} onClick={add}>
                <Plus className="size-3.5" />
            </Button>

            {active !== null && (
                <Button size="icon" variant="ghost" className="size-7" title="Удалить это состояние у всех сторон" onClick={() => onRemove(active)}>
                    <Trash2 className="size-3.5" />
                </Button>
            )}

            {names.length > 0 && (
                <>
                    <span className="text-muted-foreground ml-2 text-xs">по умолчанию:</span>
                    <Select value={defaultState ?? ''} onValueChange={onDefault}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {names.map((name) => (
                                <SelectItem key={name} value={name}>
                                    {name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </>
            )}
        </div>
    );
}
