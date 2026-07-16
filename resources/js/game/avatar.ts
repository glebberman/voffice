import { Assets, Rectangle, Texture } from 'pixi.js';
import type { Direction } from './types';

// LPC-кадры: 64×64, в walk-листе 4 ряда направлений × 9 колонок
// (колонка 0 — стоя, 1–8 — цикл шага)
export const LPC_FRAME = 64;
export const WALK_COLS = 9;

export const DIR_ROW: Record<Direction, number> = { up: 0, left: 1, down: 2, right: 3 };

const BASE = '/assets/lpc/characters/spritesheets';

// только стили с плоским adult/walk.png (у некоторых walk — папка с bg/fg
// слоями, их поддержим позже вместе с двухслойными жилетами)
const HAIRS = [
    'afro',
    'bangs',
    'bob',
    'buzzcut',
    'curly_short',
    'curtains',
    'long',
    'mop',
    'parted',
    'pixie',
    'plain',
    'shorthawk',
    'spiked',
    'swoop',
];

interface Wardrobe {
    body: string;
    head: string;
    tops: string[];
    ties: string | null;
    legs: string[];
    feet: string;
}

const WARDROBES: Wardrobe[] = [
    {
        body: 'body/bodies/male/walk.png',
        head: 'head/heads/human/male/walk.png',
        tops: [
            'torso/clothes/longsleeve/formal_striped/male/walk.png',
            'torso/clothes/shortsleeve/shortsleeve/male/walk.png',
            'torso/clothes/longsleeve/longsleeve2/male/walk.png',
            'torso/clothes/longsleeve/longsleeve2_polo/male/walk.png',
            'torso/clothes/longsleeve/longsleeve2_cardigan/male/walk.png',
        ],
        ties: 'neck/tie/necktie/male/walk.png',
        legs: ['legs/formal/male/walk.png', 'legs/pants/male/walk.png'],
        feet: 'feet/shoes/basic/male/walk.png',
    },
    {
        body: 'body/bodies/female/walk.png',
        head: 'head/heads/human/female/walk.png',
        tops: [
            'torso/clothes/shortsleeve/shortsleeve/female/walk.png',
            'torso/clothes/longsleeve/longsleeve/female/walk.png',
            'torso/clothes/longsleeve/scoop/female/walk.png',
            'torso/clothes/shortsleeve/tshirt/female/walk.png',
            'torso/clothes/longsleeve/longsleeve2_buttoned/female/walk.png',
        ],
        ties: null,
        legs: ['legs/skirts/plain/thin/walk.png', 'legs/pants/thin/walk.png', 'legs/formal/thin/walk.png'],
        feet: 'feet/shoes/basic/thin/walk.png',
    },
];

// детерминированный «рандом» по id: один и тот же пользователь всегда
// выглядит одинаково у всех клиентов
function pick<T>(items: T[], id: number, salt: number): T {
    let h = (id * 2654435761 + salt * 40503) >>> 0;
    h = (h ^ (h >> 15)) * 2246822519;
    h = (h ^ (h >> 13)) >>> 0;
    return items[h % items.length];
}

// слои снизу вверх
export function lookFor(id: number): string[] {
    const w = WARDROBES[Math.abs(id) % WARDROBES.length];
    const top = pick(w.tops, id, 1);
    const layers = [w.body, w.head, 'eyes/human/adult/default/walk.png', pick(w.legs, id, 2), w.feet, top];
    // галстук — только к «формальному» верху, через раз
    if (w.ties && top.includes('formal') && id % 2 === 0) {
        layers.push(w.ties);
    }
    layers.push(`hair/${pick(HAIRS, id, 3)}/adult/walk.png`);
    return layers;
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

export async function loadAvatar(id: number): Promise<AvatarLayers> {
    const layers: AvatarLayers = [];
    for (const path of lookFor(id)) {
        try {
            const tex: Texture = await Assets.load(`${BASE}/${path}`);
            tex.source.scaleMode = 'nearest';
            layers.push(sliceWalk(tex));
        } catch {
            // слой не нашёлся — персонаж соберётся без него
        }
    }
    return layers;
}
