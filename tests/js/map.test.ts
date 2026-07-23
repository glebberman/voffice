import { CHAT_RADIUS, makeMap, type MapData } from '@/game/map';
import { propInteractionCells, propOrientation, type PropCatalogue } from '@/game/props';
import { describe, expect, it } from 'vitest';
import coworkingData from '../../resources/maps/coworking.json';
import officeData from '../../resources/maps/office.json';
import catalogueFile from '../../resources/props.json';

// каталог, которым сидируется таблица prop_types — предметы блокируют проход
const CATALOGUE = catalogueFile.items as PropCatalogue;

const MAPS: Record<string, MapData> = {
    office: officeData as MapData,
    coworking: coworkingData as MapData,
};

// целостность каждой карты из resources/maps — того же JSON,
// которым сидер наполняет таблицу rooms
describe.each(Object.entries(MAPS))('карта %s', (name, data) => {
    const map = makeMap(data, CATALOGUE);

    it('все строки одинаковой ширины', () => {
        for (const row of map.rows) {
            expect(row.length).toBe(map.width);
        }
    });

    it('периметр — сплошная стена', () => {
        for (let x = 0; x < map.width; x++) {
            expect(map.tileAt(x, 0)).toBe('#');
            expect(map.tileAt(x, map.height - 1)).toBe('#');
        }
        for (let y = 0; y < map.height; y++) {
            expect(map.tileAt(0, y)).toBe('#');
            expect(map.tileAt(map.width - 1, y)).toBe('#');
        }
    });

    it('спавн проходим', () => {
        expect(map.isWalkable(map.spawn.x, map.spawn.y)).toBe(true);
    });

    it('в каждой зоне есть проходимые тайлы', () => {
        for (const zone of map.zones) {
            let walkable = 0;
            for (let y = zone.y1; y <= zone.y2; y++) {
                for (let x = zone.x1; x <= zone.x2; x++) {
                    if (map.isWalkable(x, y)) {
                        walkable++;
                    }
                }
            }
            expect(walkable, `зона ${zone.name}`).toBeGreaterThan(0);
        }
    });

    it('порталы стоят на проходимых тайлах и ведут в существующие карты на проходимые клетки', () => {
        for (const portal of map.portals) {
            expect(map.isWalkable(portal.x, portal.y), `портал ${portal.label}`).toBe(true);
            const target = MAPS[portal.to];
            expect(target, `карта ${portal.to} существует`).toBeDefined();
            expect(makeMap(target, CATALOGUE).isWalkable(portal.tx, portal.ty), `прибытие ${portal.label}`).toBe(true);
        }
    });

    it('у каждого функционального предмета есть клетка, на которой можно стоять', () => {
        for (const prop of map.props) {
            const spec = CATALOGUE[prop.type];
            const orientation = spec?.behavior ? propOrientation(spec, prop.dir) : null;
            if (!orientation) {
                continue; // обычная мебель: подходить к ней незачем
            }
            const cells = propInteractionCells(orientation, prop);
            expect(
                cells.some((c) => map.isWalkable(c.x, c.y)),
                `предмет ${prop.id}`,
            ).toBe(true);
        }
    });

    it('id предметов уникальны', () => {
        const ids = map.props.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('офисная карта: геометрия и правила', () => {
    const map = makeMap(MAPS.office, CATALOGUE);

    it('двери кухни и переговорки проходимы', () => {
        expect(map.isWalkable(13, 5)).toBe(true);
        expect(map.isWalkable(20, 6)).toBe(true);
    });

    it('стены, мебель и границы непроходимы', () => {
        expect(map.isWalkable(0, 0)).toBe(false);
        expect(map.isWalkable(2, 2)).toBe(false); // основание стола (предмет)
        expect(map.isWalkable(12, 2)).toBe(false); // кухонная стойка (предмет)
        expect(map.isWalkable(-1, 0)).toBe(false);
        expect(map.isWalkable(map.width, 0)).toBe(false);
    });

    it('зоны находятся, приватная только переговорка', () => {
        expect(map.zoneAt(12, 2)?.name).toBe('Кухня');
        expect(map.zoneAt(20, 3)?.isPrivate).toBe(true);
        expect(map.zoneAt(15, 11)?.name).toBe('Лаунж');
        expect(map.zoneAt(map.spawn.x, map.spawn.y)).toBeNull();
    });

    it('spotlight-плитка проходима, распознаётся и одна на карте', () => {
        expect(map.isSpotlight(8, 9)).toBe(true);
        expect(map.isWalkable(8, 9)).toBe(true);
        expect(map.isSpotlight(map.spawn.x, map.spawn.y)).toBe(false);

        let count = 0;
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                if (map.isSpotlight(x, y)) {
                    count++;
                }
            }
        }
        expect(count).toBe(1);
    });

    it('canHear: радиус в опенспейсе, изоляция приватной зоны', () => {
        expect(map.canHear(6, 8, 6 + CHAT_RADIUS, 8)).toBe(true);
        expect(map.canHear(6, 8, 6 + CHAT_RADIUS + 1, 8)).toBe(false);
        expect(map.canHear(20, 7, 20, 5)).toBe(false); // за дверью переговорки
        expect(map.canHear(17, 1, 23, 6)).toBe(true); // из угла в угол переговорки
    });

    it('resolveSpawn: сохранённая позиция или спавн', () => {
        expect(map.resolveSpawn({ x: 20, y: 4 })).toEqual({ x: 20, y: 4 });
        expect(map.resolveSpawn(null)).toEqual(map.spawn);
        expect(map.resolveSpawn({ x: 0, y: 0 })).toEqual(map.spawn);
    });

    it('portalAt и interactableAt находят сущности', () => {
        expect(map.portalAt(2, 14)?.to).toBe('coworking');
        expect(map.portalAt(6, 8)).toBeNull();
        // доска команды переехала из map.objects в предмет: стоя перед ней, её видно
        expect(map.interactableAt(20, 1)?.prop.id).toBe('office-board');
        expect(map.interactableAt(6, 8)).toBeNull();
    });
});
