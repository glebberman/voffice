import type { EditorCanvasHandle } from '@/components/editor/EditorCanvas';
import { Button } from '@/components/ui/button';
import type { Tool } from '@/hooks/use-map-editor';
import { Armchair, DoorOpen, Hand, Square, ZoomIn, ZoomOut } from 'lucide-react';

const TOOLS: { value: Tool; label: React.ReactNode }[] = [
    { value: 'paint', label: 'Кисть' },
    {
        value: 'rect',
        label: (
            <>
                <Square className="size-3.5" />
                Прямоугольник
            </>
        ),
    },
    { value: 'spawn', label: 'Спавн ⚑' },
    {
        value: 'prop',
        label: (
            <>
                <Armchair className="size-3.5" />
                Предмет
            </>
        ),
    },
    {
        value: 'door',
        label: (
            <>
                <DoorOpen className="size-3.5" />
                Дверь
            </>
        ),
    },
    { value: 'pan', label: <Hand className="size-3.5" /> },
];

/** Ряд инструментов рисования и кнопки зума поля. */
export function ToolBar({
    tool,
    onTool,
    editorRef,
}: {
    tool: Tool;
    onTool: (t: Tool) => void;
    editorRef: React.RefObject<EditorCanvasHandle | null>;
}) {
    return (
        <div className="border-sidebar-border/70 dark:border-sidebar-border flex flex-wrap gap-1 rounded-xl border p-4">
            {TOOLS.map((t) => (
                <Button key={t.value} size="sm" variant={tool === t.value ? 'default' : 'outline'} onClick={() => onTool(t.value)}>
                    {t.label}
                </Button>
            ))}
            <span className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="outline" className="size-8" onClick={() => editorRef.current?.zoomOut()}>
                    <ZoomOut className="size-3.5" />
                </Button>
                <Button size="icon" variant="outline" className="size-8" onClick={() => editorRef.current?.zoomIn()}>
                    <ZoomIn className="size-3.5" />
                </Button>
            </span>
        </div>
    );
}
