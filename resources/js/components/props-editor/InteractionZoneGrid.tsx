import { propSheetUrl, type PropCell, type PropOrientation } from '@/game/props';

const TILE = 32;
const CELL = 26; // размер клетки сетки, px
const MARGIN = 2; // сколько клеток показывать вокруг основания

/**
 * Редактор зоны взаимодействия одной ориентации: сетка вокруг footprint, клик
 * тумблерит клетку. Сам предмет отрисован для контекста (спрайт из листа),
 * основание кликать нельзя — на нём не стоят. Зона своя на каждую сторону, так
 * что поворот в редакторе показывает и разворачивает её.
 */
export function InteractionZoneGrid({
    orientation,
    cells,
    onChange,
}: {
    orientation: PropOrientation;
    cells: PropCell[];
    onChange: (cells: PropCell[]) => void;
}) {
    const { w, h, tall } = orientation;
    const dxs = cells.map((c) => c.dx);
    const dys = cells.map((c) => c.dy);
    // окно показа: основание с полями, макушка (для контекста спрайта) и все
    // уже отмеченные клетки, даже если их увели далеко
    const minDx = Math.min(-MARGIN, ...dxs);
    const maxDx = Math.max(w - 1 + MARGIN, ...dxs);
    const minDy = Math.min(-MARGIN, -tall, ...dys);
    const maxDy = Math.max(h - 1 + MARGIN, ...dys);
    const cols = maxDx - minDx + 1;
    const rows = maxDy - minDy + 1;

    const has = (dx: number, dy: number) => cells.some((c) => c.dx === dx && c.dy === dy);
    const toggle = (dx: number, dy: number) => {
        onChange(has(dx, dy) ? cells.filter((c) => !(c.dx === dx && c.dy === dy)) : [...cells, { dx, dy }]);
    };

    const grid: React.ReactNode[] = [];
    for (let dy = minDy; dy <= maxDy; dy++) {
        for (let dx = minDx; dx <= maxDx; dx++) {
            const footprint = dx >= 0 && dx < w && dy >= 0 && dy < h;
            const zone = has(dx, dy);
            const origin = dx === 0 && dy === 0;
            grid.push(
                <button
                    key={`${dx},${dy}`}
                    type="button"
                    disabled={footprint}
                    onClick={() => toggle(dx, dy)}
                    title={footprint ? 'Основание предмета' : `(${dx}, ${dy})`}
                    className={`border-sidebar-border/60 border ${
                        footprint ? 'cursor-not-allowed' : zone ? 'bg-emerald-500/45 hover:bg-emerald-500/60' : 'hover:bg-emerald-500/15'
                    } ${origin ? 'ring-primary/60 ring-1 ring-inset' : ''}`}
                    style={{ width: CELL, height: CELL }}
                />,
            );
        }
    }

    return (
        <div>
            <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-medium">Зона взаимодействия</p>
                <span className="text-muted-foreground text-xs">{cells.length ? `${cells.length} клеток` : 'не интерактивен'}</span>
                {cells.length > 0 && (
                    <button type="button" onClick={() => onChange([])} className="text-muted-foreground ml-auto text-xs underline">
                        очистить
                    </button>
                )}
            </div>
            <p className="text-muted-foreground mb-2 text-xs">
                Кликайте клетки, стоя на которых персонаж будет пользоваться предметом. Зона своя на каждую сторону.
            </p>
            <div className="relative" style={{ width: cols * CELL, height: rows * CELL }}>
                {/* предмет для контекста: базовый регион ориентации, вписан по клетке */}
                <div
                    className="pointer-events-none absolute overflow-hidden"
                    style={{ left: (0 - minDx) * CELL, top: (-tall - minDy) * CELL, width: w * CELL, height: (h + tall) * CELL }}
                >
                    <div
                        style={{
                            width: w * TILE,
                            height: (h + tall) * TILE,
                            backgroundImage: `url("${propSheetUrl(orientation)}")`,
                            backgroundPosition: `-${orientation.sx}px -${orientation.sy}px`,
                            imageRendering: 'pixelated',
                            transform: `scale(${CELL / TILE})`,
                            transformOrigin: 'top left',
                        }}
                    />
                </div>
                <div
                    className="absolute inset-0 grid"
                    style={{ gridTemplateColumns: `repeat(${cols}, ${CELL}px)`, gridTemplateRows: `repeat(${rows}, ${CELL}px)` }}
                >
                    {grid}
                </div>
            </div>
        </div>
    );
}
