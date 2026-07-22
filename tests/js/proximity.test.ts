import { CHAT_RADIUS, makeMap, type MapData } from '@/game/map';
import type { PropCatalogue } from '@/game/props';
import { callPeers, isInitiator, volumeForDistance } from '@/webrtc/proximity';
import { describe, expect, it } from 'vitest';
import officeData from '../../resources/maps/office.json';
import catalogueFile from '../../resources/props.json';

// каталог, которым сидируется таблица prop_types — предметы блокируют проход
const CATALOGUE = catalogueFile.items as PropCatalogue;

const office = makeMap(officeData as MapData, CATALOGUE);

const at = (id: number, x: number, y: number) => ({ id, x, y });

// видимость из точки — то же, чем её считает сцена: обход по карте с учётом дверей
const seenFrom = (map: ReturnType<typeof makeMap>, self: { x: number; y: number }) => {
    const reachable = map.reachableFrom(self.x, self.y);

    return (x: number, y: number) => reachable.has(y * map.width + x);
};

const anywhere = () => true;

describe('callPeers (кто в звонке по близости)', () => {
    it('пустой список, если сам не в звонке', () => {
        const inCall = new Set([2, 3]);
        expect(callPeers(office, at(1, 6, 8), [at(2, 7, 8)], inCall, anywhere)).toEqual([]);
    });

    it('соединяет только с теми, кто в звонке и в зоне слышимости', () => {
        const self = at(1, 6, 8);
        const others = [at(2, 7, 8), at(3, 20, 12), at(4, 8, 8)];
        const inCall = new Set([1, 2, 3]); // 4 не в звонке
        // 2 рядом и в звонке → да; 3 далеко → нет; 4 рядом, но не в звонке → нет
        expect(callPeers(office, self, others, inCall, anywhere)).toEqual([2]);
    });

    it('в приватной зоне соединяет со всеми в ней, игнорируя радиус', () => {
        const self = at(1, 17, 1); // угол переговорки
        const others = [at(2, 23, 6), at(3, 6, 8)]; // 2 в дальнем углу переговорки, 3 в опенспейсе
        const inCall = new Set([1, 2, 3]);
        expect(callPeers(office, self, others, inCall, anywhere)).toEqual([2]);
    });

    it('результат отсортирован по id', () => {
        const self = at(1, 6, 8);
        const others = [at(9, 7, 8), at(3, 6, 9), at(5, 7, 9)];
        const inCall = new Set([1, 3, 5, 9]);
        expect(callPeers(office, self, others, inCall, anywhere)).toEqual([3, 5, 9]);
    });
});

describe('callPeers и двери', () => {
    // своя копия карты: состояние двери мутабельное, соседним тестам оно ни к чему
    const map = makeMap(officeData as MapData, CATALOGUE);
    const self = at(1, 13, 4); // кухня
    const others = [at(2, 13, 7)]; // за дверью кухни, в трёх тайлах
    const inCall = new Set([1, 2]);

    it('при открытой двери соединяет', () => {
        expect(callPeers(map, self, others, inCall, seenFrom(map, self))).toEqual([2]);
    });

    it('за закрытую дверь звонок не тянется, хотя слышимость по радиусу проходит', () => {
        map.setDoorState('kitchen-door', { closed: true, locked: false });

        expect(map.canHear(self.x, self.y, 13, 7)).toBe(true); // радиус тот же
        expect(callPeers(map, self, others, inCall, seenFrom(map, self))).toEqual([]);
    });
});

describe('isInitiator', () => {
    it('инициатор — участник с большим id (симметрично)', () => {
        expect(isInitiator(5, 3)).toBe(true);
        expect(isInitiator(3, 5)).toBe(false);
        expect(isInitiator(3, 5)).toBe(!isInitiator(5, 3));
    });
});

describe('volumeForDistance', () => {
    it('вплотную — полная громкость', () => {
        expect(volumeForDistance(0)).toBe(1);
        expect(volumeForDistance(1)).toBe(1);
    });

    it('на краю радиуса и дальше — минимальная, но не ноль', () => {
        expect(volumeForDistance(CHAT_RADIUS)).toBe(0.15);
        expect(volumeForDistance(100)).toBe(0.15);
    });

    it('монотонно убывает с расстоянием', () => {
        expect(volumeForDistance(2)).toBeGreaterThan(volumeForDistance(3));
        expect(volumeForDistance(2)).toBeLessThan(volumeForDistance(1));
    });
});
