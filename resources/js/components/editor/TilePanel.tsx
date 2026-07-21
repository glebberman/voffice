import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { TILE_CHARS } from '@/game/map';
import { TILE_COLOR, TILE_LABEL } from '@/game/tile-colors';
import type { Tool } from '@/hooks/use-map-editor';

/**
 * Палитра тайлов: выбор кисти. Выбор тайла переключает инструмент на кисть
 * (кроме прямоугольника — он тоже рисует выбранным тайлом).
 */
export function TilePanel({ brush, tool, onBrush, onTool }: { brush: string; tool: Tool; onBrush: (ch: string) => void; onTool: (t: Tool) => void }) {
    return (
        <CollapsiblePanel title="Тайлы">
            <div className="grid grid-cols-2 gap-1.5">
                {TILE_CHARS.map((ch) => (
                    <button
                        key={ch}
                        type="button"
                        onClick={() => {
                            onBrush(ch);
                            if (tool === 'pan' || tool === 'spawn') {
                                onTool('paint');
                            }
                        }}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${brush === ch ? 'ring-primary ring-2' : ''}`}
                    >
                        <span className="size-4 shrink-0 rounded-sm border" style={{ background: TILE_COLOR[ch] }} />
                        {TILE_LABEL[ch]}
                    </button>
                ))}
            </div>
        </CollapsiblePanel>
    );
}
