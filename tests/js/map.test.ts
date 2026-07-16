import { canHear, CHAT_RADIUS, isWalkable, MAP_H, MAP_ROWS, MAP_W, resolveSpawn, SPAWN, tilesBetween, zoneAt, ZONES } from '@/game/map';
import { describe, expect, it } from 'vitest';

describe('целостность карты', () => {
    it('все строки одинаковой ширины', () => {
        for (const row of MAP_ROWS) {
            expect(row.length).toBe(MAP_W);
        }
        expect(MAP_ROWS.length).toBe(MAP_H);
    });

    it('периметр карты — сплошная стена', () => {
        for (let x = 0; x < MAP_W; x++) {
            expect(MAP_ROWS[0][x]).toBe('#');
            expect(MAP_ROWS[MAP_H - 1][x]).toBe('#');
        }
        for (let y = 0; y < MAP_H; y++) {
            expect(MAP_ROWS[y][0]).toBe('#');
            expect(MAP_ROWS[y][MAP_W - 1]).toBe('#');
        }
    });

    it('спавн проходим', () => {
        expect(isWalkable(SPAWN.x, SPAWN.y)).toBe(true);
    });

    it('двери кухни и переговорки проходимы', () => {
        expect(isWalkable(13, 5)).toBe(true); // дверь кухни
        expect(isWalkable(20, 6)).toBe(true); // дверь переговорки
    });

    it('каждая зона достижима: внутри есть проходимые тайлы', () => {
        for (const zone of ZONES) {
            let walkable = 0;
            for (let y = zone.y1; y <= zone.y2; y++) {
                for (let x = zone.x1; x <= zone.x2; x++) {
                    if (isWalkable(x, y)) {
                        walkable++;
                    }
                }
            }
            expect(walkable, `зона ${zone.name}`).toBeGreaterThan(0);
        }
    });
});

describe('isWalkable', () => {
    it('стены и мебель непроходимы', () => {
        expect(isWalkable(0, 0)).toBe(false); // стена
        expect(isWalkable(2, 2)).toBe(false); // стол (D)
        expect(isWalkable(3, 7)).toBe(false); // растение (P)
    });

    it('за пределами карты непроходимо', () => {
        expect(isWalkable(-1, 0)).toBe(false);
        expect(isWalkable(MAP_W, 0)).toBe(false);
        expect(isWalkable(0, MAP_H)).toBe(false);
    });
});

describe('зоны', () => {
    it('находит кухню, переговорку и лаунж', () => {
        expect(zoneAt(12, 2)?.name).toBe('Кухня');
        expect(zoneAt(20, 3)?.name).toBe('Переговорка');
        expect(zoneAt(15, 11)?.name).toBe('Лаунж');
    });

    it('опенспейс — вне зон', () => {
        expect(zoneAt(SPAWN.x, SPAWN.y)).toBeNull();
    });

    it('приватная только переговорка', () => {
        expect(zoneAt(20, 3)?.isPrivate).toBe(true);
        expect(zoneAt(12, 2)?.isPrivate).toBeUndefined();
        expect(zoneAt(15, 11)?.isPrivate).toBeUndefined();
    });
});

describe('canHear (слышимость чата)', () => {
    it('в опенспейсе слышно в радиусе и не слышно дальше', () => {
        expect(canHear(6, 8, 6 + CHAT_RADIUS, 8)).toBe(true);
        expect(canHear(6, 8, 6 + CHAT_RADIUS + 1, 8)).toBe(false);
    });

    it('приватная зона не выпускает звук наружу даже вплотную', () => {
        // (20,5) — внутри переговорки, (20,7) — сразу за дверью, дистанция 2
        expect(canHear(20, 7, 20, 5)).toBe(false);
        expect(canHear(20, 5, 20, 7)).toBe(false);
    });

    it('внутри приватной зоны слышно из любого угла, радиус не важен', () => {
        // углы переговорки: дистанция ~7.8 > CHAT_RADIUS
        expect(tilesBetween(17, 1, 23, 6)).toBeGreaterThan(CHAT_RADIUS);
        expect(canHear(17, 1, 23, 6)).toBe(true);
    });

    it('непр приватные зоны работают по радиусу', () => {
        expect(canHear(12, 2, 14, 2)).toBe(true); // оба на кухне, рядом
        expect(canHear(12, 2, 14, 11)).toBe(false); // кухня → лаунж, далеко
    });
});

describe('resolveSpawn', () => {
    it('возвращает сохранённую позицию, если она проходима', () => {
        expect(resolveSpawn({ x: 20, y: 4 })).toEqual({ x: 20, y: 4 });
    });

    it('падает обратно на спавн для null и непроходимых клеток', () => {
        expect(resolveSpawn(null)).toEqual(SPAWN);
        expect(resolveSpawn({ x: 0, y: 0 })).toEqual(SPAWN); // стена
        expect(resolveSpawn({ x: 2, y: 2 })).toEqual(SPAWN); // стол
        expect(resolveSpawn({ x: 999, y: 999 })).toEqual(SPAWN); // вне карты
    });
});
