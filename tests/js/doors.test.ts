import { makeMap, type DoorData, type MapData } from '@/game/map';
import { describe, expect, it } from 'vitest';

// Две комнаты, соединённые единственным проёмом на (3,3):
//   строки 1-2 — верхняя комната, строки 4-5 — нижняя.
const rows = ['#######', '#.DDD.#', '#.....#', '###.###', '#.....#', '#.DDD.#', '#######'];

const mapWith = (doors: DoorData[]): MapData => ({
    rows,
    spawn: { x: 1, y: 1 },
    zones: [],
    portals: [],
    doors,
});

const door = (lock: DoorData['lock'] = null): DoorData => ({ id: 'd1', x: 3, y: 3, lock });

const cell = (x: number, y: number) => y * rows[0].length + x;

describe('проходимость двери', () => {
    it('открытая дверь пропускает', () => {
        const map = makeMap(mapWith([door()]));

        expect(map.isWalkable(3, 3)).toBe(true);
    });

    it('закрытая — нет', () => {
        const map = makeMap(mapWith([door()]));
        map.setDoorState('d1', { closed: true, locked: false });

        expect(map.isWalkable(3, 3)).toBe(false);
    });

    it('дверь на непроходимом тайле не делает его проходимым', () => {
        const map = makeMap(mapWith([{ id: 'wall', x: 0, y: 3, lock: null }]));

        expect(map.isWalkable(0, 3)).toBe(false);
    });

    it('состояние неизвестной двери не роняет карту', () => {
        const map = makeMap(mapWith([door()]));
        map.setDoorState('нет-такой', { closed: true, locked: true });

        expect(map.isWalkable(3, 3)).toBe(true);
    });
});

describe('сторона замка', () => {
    it('замок сверху: с верхней клетки можно, с нижней нельзя', () => {
        const map = makeMap(mapWith([door('north')]));
        const d = map.doorAt(3, 3);
        expect(d).not.toBeNull();
        if (d === null) {
            return;
        }

        expect(map.onLockSide(d, 3, 2)).toBe(true);
        expect(map.onLockSide(d, 3, 4)).toBe(false);
        expect(map.onLockSide(d, 2, 3)).toBe(false);
    });

    it('без замка ни одна сторона не подходит', () => {
        const map = makeMap(mapWith([door()]));
        const d = map.doorAt(3, 3);
        expect(d).not.toBeNull();
        if (d === null) {
            return;
        }

        expect(map.onLockSide(d, 3, 2)).toBe(false);
        expect(map.onLockSide(d, 3, 4)).toBe(false);
    });
});

describe('достижимость', () => {
    it('через открытую дверь видно обе комнаты', () => {
        const map = makeMap(mapWith([door()]));
        const seen = map.reachableFrom(1, 1);

        expect(seen.has(cell(1, 1))).toBe(true);
        expect(seen.has(cell(5, 5))).toBe(true); // дальний угол нижней комнаты
    });

    it('закрытая дверь отрезает вторую комнату, но саму дверь видно', () => {
        const map = makeMap(mapWith([door()]));
        map.setDoorState('d1', { closed: true, locked: false });
        const seen = map.reachableFrom(1, 1);

        expect(seen.has(cell(1, 2))).toBe(true); // своя комната
        expect(seen.has(cell(3, 3))).toBe(true); // сама дверь видна со своей стороны
        expect(seen.has(cell(3, 4))).toBe(false); // а за ней уже нет
        expect(seen.has(cell(5, 5))).toBe(false);
    });

    it('вид из-за закрытой двери симметричен', () => {
        const map = makeMap(mapWith([door()]));
        map.setDoorState('d1', { closed: true, locked: false });
        const seen = map.reachableFrom(1, 5);

        expect(seen.has(cell(5, 4))).toBe(true);
        expect(seen.has(cell(3, 3))).toBe(true);
        expect(seen.has(cell(1, 1))).toBe(false);
    });

    // Затемнять нужно недоступные ПОМЕЩЕНИЯ, а не каждый непроходимый тайл:
    // иначе в тень уходили бы столы и стены той комнаты, где персонаж стоит.
    it('своя мебель и свои стены видны, хотя по ним не пройти', () => {
        const map = makeMap(mapWith([door()]));
        map.setDoorState('d1', { closed: true, locked: false });
        const seen = map.reachableFrom(1, 5); // нижняя комната

        expect(map.isWalkable(2, 5)).toBe(false); // это стол
        expect(seen.has(cell(2, 5))).toBe(true); // но он в своей комнате — видно
        expect(seen.has(cell(0, 5))).toBe(true); // и стена своей комнаты
    });

    it('мебель чужой комнаты за закрытой дверью не видна', () => {
        const map = makeMap(mapWith([door()]));
        map.setDoorState('d1', { closed: true, locked: false });
        const seen = map.reachableFrom(1, 5);

        expect(seen.has(cell(2, 1))).toBe(false); // стол верхней комнаты
        expect(seen.has(cell(1, 1))).toBe(false); // и её пол
    });

    it('глухой угол карты в набор не попадает', () => {
        const map = makeMap(mapWith([]));
        const seen = map.reachableFrom(1, 1);

        expect(seen.has(cell(0, 0))).toBe(false);
    });

    it('из-за пределов карты набор пуст', () => {
        const map = makeMap(mapWith([]));

        expect(map.reachableFrom(-1, 0).size).toBe(0);
        expect(map.reachableFrom(99, 99).size).toBe(0);
    });

    it('карта без дверей связна целиком', () => {
        const map = makeMap(mapWith([]));
        const seen = map.reachableFrom(1, 1);

        expect(seen.has(cell(5, 5))).toBe(true);
    });
});
