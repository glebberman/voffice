import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PROP_DIR_LABEL, PROP_DIRS, type PropDir } from '@/game/props';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Вкладки сторон предмета. Показывают только заведённые ориентации; недостающие
 * добавляются из выпадающего списка, активная удаляется корзинкой (кроме
 * последней — хотя бы одна сторона у предмета обязана быть).
 */
export function OrientationTabs({
    dirs,
    active,
    onSelect,
    onAdd,
    onRemove,
}: {
    dirs: PropDir[];
    active: PropDir;
    onSelect: (dir: PropDir) => void;
    onAdd: (dir: PropDir) => void;
    onRemove: (dir: PropDir) => void;
}) {
    const missing = PROP_DIRS.filter((dir) => !dirs.includes(dir));

    return (
        <div className="flex items-center gap-1.5">
            {dirs.map((dir) => (
                <button
                    key={dir}
                    type="button"
                    onClick={() => onSelect(dir)}
                    className={`rounded-md border px-2 py-1 text-xs ${dir === active ? 'ring-primary ring-2' : 'text-muted-foreground'}`}
                >
                    {PROP_DIR_LABEL[dir]}
                </button>
            ))}

            {missing.length > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                            <Plus className="size-3.5" />
                            Сторона
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {missing.map((dir) => (
                            <DropdownMenuItem key={dir} onSelect={() => onAdd(dir)}>
                                {PROP_DIR_LABEL[dir]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title={dirs.length > 1 ? 'Удалить эту сторону' : 'Единственную сторону удалить нельзя'}
                disabled={dirs.length <= 1}
                onClick={() => onRemove(active)}
            >
                <Trash2 className="size-3.5" />
            </Button>
        </div>
    );
}
