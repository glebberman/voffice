import { propSheetUrl } from '@/game/props';
import { useCallback, useEffect, useRef, useState } from 'react';

const TILE = 32;
const ZOOM = 3; // лист мелкий, без увеличения по нему не попасть мышью

/** Регион на листе спрайтов с границей «воздух / основание». */
export interface SpriteRegion {
    sx: number;
    sy: number;
    w: number;
    h: number;
    tall: number;
}

/**
 * Канвас-кроппер: протянуть рамку по листу — выделить регион, тянуть оранжевую
 * линию — двигать границу «воздух / основание». Полностью управляемый: сам
 * ничего не хранит, каждое движение мыши уходит в onChange.
 *
 * fixedSize — режим региона состояния: размер и граница заданы ориентацией,
 * мышью двигается только положение рамки.
 */
export function SheetCropper({
    sheet,
    value,
    onChange,
    fixedSize = false,
}: {
    sheet: string;
    value: SpriteRegion;
    onChange: (region: SpriteRegion) => void;
    fixedSize?: boolean;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    // что тянем мышью: рамку региона, границу «воздух / основание» или рамку целиком
    const dragRef = useRef<{ mode: 'region' | 'divider' | 'move'; anchorX: number; anchorY: number } | null>(null);

    const total = value.h + value.tall; // высота региона в тайлах

    // лист спрайтов грузим один раз на смену выбора
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
        const rx = value.sx * ZOOM;
        const ry = value.sy * ZOOM;
        const rw = value.w * TILE * ZOOM;
        const rh = total * TILE * ZOOM;
        ctx.fillStyle = 'rgba(24,24,27,0.55)';
        ctx.fillRect(0, 0, canvas.width, ry);
        ctx.fillRect(0, ry + rh, canvas.width, canvas.height - ry - rh);
        ctx.fillRect(0, ry, rx, rh);
        ctx.fillRect(rx + rw, ry, canvas.width - rx - rw, rh);

        // висящая в воздухе часть — синим, основание — зелёным
        const tallH = value.tall * TILE * ZOOM;
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
        if (value.tall > 0) {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(rx, ry + tallH);
            ctx.lineTo(rx + rw, ry + tallH);
            ctx.stroke();
        }
    }, [value, imageSize, total]);

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
        // Протяжка часто уходит за край канваса, а отрицательный sx всплывал бы
        // только при сохранении — зажимаем в границы листа сразу.
        const cols = Math.max(1, Math.floor(imageSize.width / TILE));
        const rows = Math.max(1, Math.floor(imageSize.height / TILE));

        return {
            x: Math.max(0, Math.min(cols - 1, Math.floor(px / TILE))),
            y: Math.max(0, Math.min(rows - 1, Math.floor(py / TILE))),
            py: Math.max(0, Math.min(imageSize.height, py)),
        };
    };

    // рамка фиксированного размера встаёт левым верхним углом в тайл, не
    // вылезая за лист
    const moveTo = (x: number, y: number) => {
        const maxX = Math.max(0, imageSize.width - value.w * TILE);
        const maxY = Math.max(0, imageSize.height - total * TILE);
        onChange({ ...value, sx: Math.max(0, Math.min(x * TILE, maxX)), sy: Math.max(0, Math.min(y * TILE, maxY)) });
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const { x, y, py } = tileAt(e);
        e.currentTarget.setPointerCapture(e.pointerId);

        if (fixedSize) {
            dragRef.current = { mode: 'move', anchorX: x, anchorY: y };
            moveTo(x, y);
            return;
        }

        // клик у самой границы внутри региона — тянем её, а не рисуем новый регион
        const dividerY = value.sy + value.tall * TILE;
        const insideX = x >= value.sx / TILE && x < value.sx / TILE + value.w;
        const insideY = py >= value.sy && py <= value.sy + total * TILE;
        if (insideX && insideY && Math.abs(py - dividerY) <= 6 && total > 1) {
            dragRef.current = { mode: 'divider', anchorX: x, anchorY: y };
            return;
        }

        dragRef.current = { mode: 'region', anchorX: x, anchorY: y };
        onChange({ sx: x * TILE, sy: y * TILE, w: 1, h: 1, tall: 0 });
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragRef.current;
        if (!drag) {
            return;
        }
        const { x, y, py } = tileAt(e);

        if (drag.mode === 'move') {
            moveTo(x, y);
            return;
        }

        if (drag.mode === 'divider') {
            // граница ходит по тайлам внутри региона; основание — минимум 1 тайл
            const rows = Math.max(0, Math.min(total - 1, Math.round((py - value.sy) / TILE)));
            onChange({ ...value, tall: rows, h: total - rows });
            return;
        }

        const left = Math.min(drag.anchorX, x);
        const top = Math.min(drag.anchorY, y);
        onChange({
            sx: left * TILE,
            sy: top * TILE,
            w: Math.abs(x - drag.anchorX) + 1,
            h: Math.abs(y - drag.anchorY) + 1 - value.tall,
            tall: value.tall,
        });
    };

    const onPointerUp = () => {
        dragRef.current = null;
    };

    return (
        <>
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
                    Регион {value.sx},{value.sy} · {value.w}×{total} тайлов
                </span>
                <span className="text-green-600 dark:text-green-500">
                    Основание {value.w}×{value.h}
                </span>
                <span className="text-blue-600 dark:text-blue-400">В воздухе +{value.tall}</span>
            </div>
        </>
    );
}
