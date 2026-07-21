import { Assets, Rectangle, Texture } from 'pixi.js';
import type { PropData } from '../map';
import { propBaseRect, propOrientation, propSheetUrl, propSpec, propTallRect, withState, type PropCatalogue, type PropOrientation } from '../props';

/**
 * Текстуры предмета: основание рисуется под игроками, высокая часть — над
 * ними (null, если предмету нечем нависать).
 */
export interface PropTextures {
    base: Texture;
    tall: Texture | null;
}

/**
 * Как предмет выглядит на карте: спека по типу, сторона по dir, регион по
 * состоянию. Общий резолв для игровой сцены, редактора и превью каталога.
 * state не передан — берётся состояние по умолчанию из каталога.
 */
export function resolvePropView(catalogue: PropCatalogue, prop: PropData, state?: string | null): PropOrientation | null {
    const spec = propSpec(catalogue, prop.type);
    const base = spec ? propOrientation(spec, prop.dir) : null;
    if (!spec || !base) {
        return null;
    }

    return withState(base, state !== undefined ? state : spec.defaultState);
}

/**
 * Режет лист спрайтов на текстуры основания и высокой части. Лист грузится
 * через Assets и кэшируется им же — повторные вызовы за тем же листом дёшевы.
 */
export async function loadPropTextures(orientation: PropOrientation): Promise<PropTextures> {
    const sheet: Texture = await Assets.load(propSheetUrl(orientation));
    sheet.source.scaleMode = 'nearest';

    const base = propBaseRect(orientation);
    const tall = propTallRect(orientation);

    return {
        base: new Texture({ source: sheet.source, frame: new Rectangle(base.x, base.y, base.width, base.height) }),
        tall: tall ? new Texture({ source: sheet.source, frame: new Rectangle(tall.x, tall.y, tall.width, tall.height) }) : null,
    };
}
