import { TILE } from '@/game/map';
import { propSheetUrl, type PropOrientation } from '@/game/props';
import { useEffect, useRef } from 'react';

/**
 * Превью предмета для карточки каталога: вырезает регион ориентации из листа и
 * вписывает его в квадрат `box`, сохраняя пропорции. Пиксель-арт не сглаживаем.
 * Тот же лист уже грузит игра/сцена — браузер отдаёт его из кэша.
 */
export function PropThumbnail({ orientation, box = 56 }: { orientation: PropOrientation; box?: number }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const sw = orientation.w * TILE;
        const sh = (orientation.h + orientation.tall) * TILE;
        const scale = Math.min(box / sw, box / sh, 4); // до 4× — маленькие предметы не должны расплываться в кашу
        const dw = Math.max(1, Math.round(sw * scale));
        const dh = Math.max(1, Math.round(sh * scale));
        canvas.width = dw;
        canvas.height = dh;

        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) {
                return;
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, dw, dh);
            ctx.drawImage(img, orientation.sx, orientation.sy, sw, sh, 0, 0, dw, dh);
        };
        img.src = propSheetUrl(orientation);
        return () => {
            cancelled = true;
        };
        // сравниваем по примитивам региона, а не по ссылке: withState отдаёт новый
        // объект каждый рендер у предметов с состоянием — иначе Image грузился бы заново
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orientation.sheet, orientation.sx, orientation.sy, orientation.w, orientation.h, orientation.tall, box]);

    return <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" style={{ imageRendering: 'pixelated' }} />;
}
