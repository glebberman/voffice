import { Assets, Rectangle, Texture } from 'pixi.js';
import wardrobeData from '../../wardrobe.json';
import type { Direction } from './types';

// LPC-кадры: 64×64, в walk-листе 4 ряда направлений × 9 колонок
// (колонка 0 — стоя, 1–8 — цикл шага)
export const LPC_FRAME = 64;
export const WALK_COLS = 9;

export const DIR_ROW: Record<Direction, number> = { up: 0, left: 1, down: 2, right: 3 };

const BASE = '/assets/lpc/characters/spritesheets';

// Гардероб — единый источник правды в resources/wardrobe.json:
// его же читает AvatarController для whitelist-валидации.
interface WardrobeItem {
    label: string;
    path: string;
}

interface WardrobeBody {
    label: string;
    body: string;
    head: string;
    feet: string;
    tie: string | null;
    tops: Record<string, WardrobeItem>;
    legs: Record<string, WardrobeItem>;
}

export interface Wardrobe {
    bodies: Record<string, WardrobeBody>;
    hairs: string[];
    // причёски, у которых walk разбит на задний и передний слой (коса, хвост):
    // задний уходит за голову, передний рисуется поверх. Их walk лежит не
    // файлом, а в подпапках bg/ и fg/.
    layeredHairs: string[];
    eyes: string;
}

export const WARDROBE = wardrobeData as Wardrobe;

// сохранённый образ пользователя (users.avatar)
export interface AvatarConfig {
    body: string;
    hair: string;
    top: string;
    legs: string;
    tie?: boolean;
}

const hairPath = (style: string) => `hair/${style}/adult/walk.png`;
const hairBackPath = (style: string) => `hair/${style}/adult/bg/walk.png`;
const hairFrontPath = (style: string) => `hair/${style}/adult/fg/walk.png`;

// детерминированный «рандом» по id: один и тот же пользователь всегда
// выглядит одинаково у всех клиентов
function pick<T>(items: T[], id: number, salt: number): T {
    let h = (id * 2654435761 + salt * 40503) >>> 0;
    h = (h ^ (h >> 15)) * 2246822519;
    h = (h ^ (h >> 13)) >>> 0;
    const item = items[h % items.length];
    if (item === undefined) {
        throw new Error('pick: пустой список для выбора');
    }
    return item;
}

function buildLayers(body: WardrobeBody, topPath: string, legsPath: string, hair: string, tie: boolean): string[] {
    const layered = WARDROBE.layeredHairs.includes(hair);
    // z-порядок = порядок в массиве. Задний слой причёски идёт сразу за телом,
    // перед головой — иначе коса/хвост лежали бы поверх лица.
    const layers = layered ? [body.body, hairBackPath(hair)] : [body.body];
    layers.push(body.head, WARDROBE.eyes, legsPath, body.feet, topPath);
    if (tie && body.tie) {
        layers.push(body.tie);
    }
    layers.push(layered ? hairFrontPath(hair) : hairPath(hair));
    return layers;
}

/**
 * Значение по ключу, пришедшему извне. Тип словаря обещает, что значение есть
 * всегда, но ключ приходит из сохранённого конфига и может устареть — здесь
 * это признаётся явно.
 */
function lookup<T>(dict: Record<string, T>, key: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
}

// образ из сохранённых настроек; null — если конфиг не проходит по гардеробу
export function lookFromConfig(cfg: AvatarConfig | null | undefined): string[] | null {
    if (!cfg) {
        return null;
    }
    // Ключи приходят от пользователя, поэтому каждый шаг проверяем до
    // обращения к следующему: раньше body.tops читали до проверки самого body,
    // и незнакомое тело роняло сборку образа вместо возврата null.
    const body = lookup(WARDROBE.bodies, cfg.body);
    if (!body) {
        return null;
    }
    const top = lookup(body.tops, cfg.top);
    const legs = lookup(body.legs, cfg.legs);
    if (!top || !legs || !WARDROBE.hairs.includes(cfg.hair)) {
        return null;
    }
    return buildLayers(body, top.path, legs.path, cfg.hair, cfg.tie === true);
}

// слои снизу вверх — фолбэк, пока пользователь не настроил образ
export function lookFor(id: number): string[] {
    const bodyKeys = Object.keys(WARDROBE.bodies);
    const bodyKey = bodyKeys[Math.abs(id) % bodyKeys.length];
    const body = bodyKey !== undefined ? WARDROBE.bodies[bodyKey] : undefined;
    if (!body) {
        throw new Error('lookFor: пустой гардероб (нет тел)');
    }
    const topKey = pick(Object.keys(body.tops), id, 1);
    const legsKey = pick(Object.keys(body.legs), id, 2);
    const hair = pick(WARDROBE.hairs, id, 3);
    // галстук — только к «формальному» верху, через раз
    const tie = topKey === 'formal' && id % 2 === 0;
    // ключи взяты из самого словаря, но индексный доступ этого не знает
    const top = body.tops[topKey];
    const legs = body.legs[legsKey];
    if (!top || !legs) {
        throw new Error('lookFor: несогласованный гардероб');
    }
    return buildLayers(body, top.path, legs.path, hair, tie);
}

// Режет лист на сетку кадров walk-анимации [направление 0-3][кадр 0-8].
// Поддерживает оба формата: по-анимационный walk.png (4 ряда) и
// универсальный лист (walk — ряды 8–11).
function sliceWalk(tex: Texture): Texture[][] {
    const cols = Math.min(WALK_COLS, Math.floor(tex.width / LPC_FRAME));
    const rowOffset = tex.height > 512 ? 8 : 0;
    const grid: Texture[][] = [];
    for (let r = 0; r < 4; r++) {
        const row: Texture[] = [];
        for (let c = 0; c < cols; c++) {
            row.push(
                new Texture({
                    source: tex.source,
                    frame: new Rectangle(c * LPC_FRAME, (rowOffset + r) * LPC_FRAME, LPC_FRAME, LPC_FRAME),
                }),
            );
        }
        grid.push(row);
    }
    return grid;
}

export type AvatarLayers = Texture[][][]; // [слой][направление][кадр]

/**
 * Освобождает нарезанные кадры образа. `Texture.destroy()` по умолчанию не
 * трогает source — лист остаётся в кэше Assets и переиспользуется, — но снимает
 * подписку кадра на resize листа. Без этого список слушателей source копит все
 * когда-либо нарезанные кадры (по ~250 на образ), и вкладка, живущая днями,
 * растёт с каждым входом коллеги, сменой образа и переходом между комнатами.
 */
export function releaseAvatar(layers: AvatarLayers | null): void {
    for (const layer of layers ?? []) {
        for (const row of layer) {
            for (const frame of row) {
                frame.destroy();
            }
        }
    }
}

export function layerUrl(path: string): string {
    return `${BASE}/${path}`;
}

export async function loadAvatar(id: number, cfg?: AvatarConfig | null): Promise<AvatarLayers> {
    const paths = lookFromConfig(cfg) ?? lookFor(id);
    const layers: AvatarLayers = [];
    for (const path of paths) {
        try {
            const tex: Texture = await Assets.load(layerUrl(path));
            tex.source.scaleMode = 'nearest';
            layers.push(sliceWalk(tex));
        } catch {
            // слой не нашёлся — персонаж соберётся без него
        }
    }
    return layers;
}
