import { lookFor, lookFromConfig, WARDROBE } from '@/game/avatar';
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

describe('lookFromConfig (сохранённый образ)', () => {
    it('валидный конфиг собирает слои, галстук по флагу', () => {
        const layers = lookFromConfig({ body: 'male', hair: 'bob', top: 'formal', legs: 'formal', tie: true });
        expect(layers).not.toBeNull();
        expect(layers!.some((l) => l.includes('neck/tie'))).toBe(true);
        expect(layers!.at(-1)).toBe('hair/bob/adult/walk.png');

        const noTie = lookFromConfig({ body: 'male', hair: 'bob', top: 'formal', legs: 'formal' });
        expect(noTie!.some((l) => l.includes('neck/tie'))).toBe(false);
    });

    it('невалидные ключи отклоняются', () => {
        expect(lookFromConfig(null)).toBeNull();
        expect(lookFromConfig({ body: 'alien', hair: 'bob', top: 'shirt', legs: 'pants' })).toBeNull();
        expect(lookFromConfig({ body: 'male', hair: '../../etc', top: 'shirt', legs: 'pants' })).toBeNull();
        // formal-верх есть только у мужского тела
        expect(lookFromConfig({ body: 'female', hair: 'bob', top: 'formal', legs: 'pants' })).toBeNull();
    });

    it('вся матрица гардероба существует на диске', () => {
        const missing = new Set<string>();
        for (const [bodyKey, body] of Object.entries(WARDROBE.bodies)) {
            for (const topKey of Object.keys(body.tops)) {
                for (const legsKey of Object.keys(body.legs)) {
                    const layers = lookFromConfig({ body: bodyKey, hair: WARDROBE.hairs[0], top: topKey, legs: legsKey, tie: true })!;
                    for (const layer of layers) {
                        if (!existsSync(`${SPRITES_DIR}/${layer}`)) {
                            missing.add(layer);
                        }
                    }
                }
            }
        }
        for (const hair of WARDROBE.hairs) {
            if (!existsSync(`${SPRITES_DIR}/hair/${hair}/adult/walk.png`)) {
                missing.add(hair);
            }
        }
        expect([...missing]).toEqual([]);
    });
});
