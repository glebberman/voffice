import { lookFor } from '@/game/avatar';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SPRITES_DIR = fileURLToPath(new URL('../../public/assets/lpc/characters/spritesheets', import.meta.url));

describe('lookFor (детерминированный образ по id)', () => {
    it('один и тот же id всегда даёт один и тот же образ', () => {
        for (const id of [1, 2, 7, 42]) {
            expect(lookFor(id)).toEqual(lookFor(id));
        }
    });

    it('образ состоит минимум из тела, головы, глаз, низа, обуви, верха и причёски', () => {
        const layers = lookFor(1);
        expect(layers.length).toBeGreaterThanOrEqual(7);
        expect(layers[0]).toContain('body/bodies/');
        expect(layers[1]).toContain('head/heads/');
        expect(layers.at(-1)).toMatch(/^hair\/[a-z_]+\/adult\/walk\.png$/);
    });

    it('галстук — только к формальному верху и только у чётных id', () => {
        for (let id = 1; id <= 60; id++) {
            const layers = lookFor(id);
            if (layers.some((l) => l.includes('neck/tie'))) {
                expect(id % 2).toBe(0);
                expect(layers.some((l) => l.includes('formal'))).toBe(true);
            }
        }
    });

    it('регресс «лысой Ани»: каждый слой каждого образа существует на диске', () => {
        const missing = new Set<string>();
        for (let id = 1; id <= 60; id++) {
            for (const layer of lookFor(id)) {
                if (!existsSync(`${SPRITES_DIR}/${layer}`)) {
                    missing.add(layer);
                }
            }
        }
        expect([...missing]).toEqual([]);
    });
});
