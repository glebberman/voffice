import { makeMap, type MapData } from '@/game/map';
import {
    propBaseRect,
    propDirs,
    propFits,
    propFootprint,
    propOrientation,
    propSpec,
    propTallRect,
    type PropCatalogue,
    type PropOrientation,
    type PropSpec,
} from '@/game/props';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import catalogueFile from '../../resources/props.json';

const LPC_DIR = fileURLToPath(new URL('../../public/assets/lpc', import.meta.url));

// В рантайме каталог приходит из БД; resources/props.json — то, чем таблица
// сидируется (PropTypeSeeder), поэтому проверяем именно его.
const PROP_SPECS = catalogueFile.items as PropCatalogue;
const PROP_TYPES = Object.keys(PROP_SPECS);

/** Спека по ключу: в каталоге она есть, иначе тест и должен упасть. */
const spec = (type: string): PropSpec => {
    const found = PROP_SPECS[type];
    if (!found) {
        throw new Error(`в каталоге нет предмета ${type}`);
    }

    return found;
};

/** Ориентация по умолчанию: у каждого предмета каталога она обязана быть. */
const orient = (type: string): PropOrientation => {
    const found = propOrientation(spec(type));
    if (!found) {
        throw new Error(`у предмета ${type} нет ни одной ориентации`);
    }

    return found;
};

// карта 8×8: пол внутри, стена по периметру
const baseMap = (props: MapData['props']): MapData => ({
    rows: ['########', '#......#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
    spawn: { x: 1, y: 1 },
    zones: [],
    objects: [],
    portals: [],
    props,
});

describe('каталог предметов', () => {
    it('спрайт каждой ориентации есть на диске', () => {
        const missing = PROP_TYPES.flatMap((type) =>
            Object.values(spec(type).orientations).filter((o) => !existsSync(`${LPC_DIR}/${o.sheet}`)).map((o) => `${type}: ${o.sheet}`),
        );
        expect(missing).toEqual([]);
    });

    it('у каждой ориентации положительное основание и неотрицательная высота', () => {
        for (const type of PROP_TYPES) {
            const item = spec(type);
            expect(item.label, type).toBeTruthy();
            const orientations = Object.values(item.orientations);
            expect(orientations.length, type).toBeGreaterThan(0);
            for (const orientation of orientations) {
                expect(orientation.w, type).toBeGreaterThan(0);
                expect(orientation.h, type).toBeGreaterThan(0);
                expect(orientation.tall, type).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('неизвестный тип не ломает propSpec', () => {
        expect(propSpec(PROP_SPECS, 'нет-такого')).toBeNull();
    });
});

describe('ориентации', () => {
    // предмет с двумя сторонами: повёрнутый меняет не только спрайт, но и footprint
    const twoSided: PropSpec = {
        label: 'Стол',
        orientations: {
            south: { sheet: 'office/Card Table.png', sx: 0, sy: 0, w: 4, h: 1, tall: 1 },
            east: { sheet: 'office/Card Table.png', sx: 96, sy: 0, w: 1, h: 2, tall: 0 },
        },
    };

    it('явная сторона отдаёт свой регион и свою геометрию', () => {
        expect(propOrientation(twoSided, 'east')).toMatchObject({ sx: 96, w: 1, h: 2 });
    });

    it('без dir берётся south', () => {
        expect(propOrientation(twoSided)).toMatchObject({ sx: 0, w: 4 });
    });

    it('осиротевшая сторона откатывается на south', () => {
        // карту могли сохранить до того, как у типа удалили ориентацию
        expect(propOrientation(twoSided, 'north')).toMatchObject({ sx: 0, w: 4 });
    });

    it('у типа без south берётся первая существующая сторона', () => {
        const eastOnly: PropSpec = { label: 'Стол', orientations: { east: twoSided.orientations.east } };
        expect(propOrientation(eastOnly, 'north')).toMatchObject({ sx: 96, h: 2 });
    });

    it('пустой набор ориентаций даёт null', () => {
        expect(propOrientation({ label: 'Пусто', orientations: {} })).toBeNull();
    });

    it('propDirs перечисляет стороны в каноническом порядке', () => {
        expect(propDirs(twoSided)).toEqual(['south', 'east']);
    });

    it('повёрнутый предмет блокирует клетки своей ориентации', () => {
        const catalogue: PropCatalogue = { table: twoSided };
        const map = makeMap(baseMap([{ id: 'p', type: 'table', x: 2, y: 2, dir: 'east' }]), catalogue);

        expect(map.isWalkable(2, 2)).toBe(false); // основание 1×2 вниз
        expect(map.isWalkable(2, 3)).toBe(false);
        expect(map.isWalkable(3, 2)).toBe(true); // а не 4×1 вправо, как у south
        expect(map.isOverhead(2, 1)).toBe(false); // у east нет части в воздухе
    });
});

describe('геометрия спрайта', () => {
    it('основание лежит под высокой частью, обе части вместе дают полный спрайт', () => {
        const cabinet = orient('cabinet'); // 2×1, воздух +2
        const tall = propTallRect(cabinet);
        const base = propBaseRect(cabinet);

        expect(tall).not.toBeNull();
        if (tall === null) {
            return;
        }

        expect(tall.height).toBe(2 * 32);
        expect(base.y).toBe(tall.y + tall.height);
        expect(base.height).toBe(32);
        expect(base.width).toBe(2 * 32);
    });

    it('у предмета без высоты нет верхней части', () => {
        expect(propTallRect(orient('bin'))).toBeNull();
    });

    it('footprint перечисляет все клетки основания', () => {
        const cells = propFootprint(orient('cabinet'), { x: 3, y: 4 });
        expect(cells).toEqual([
            { x: 3, y: 4 },
            { x: 4, y: 4 },
        ]);
    });
});

describe('проходимость', () => {
    it('основание предмета блокирует проход', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'cabinet', x: 2, y: 4 }]), PROP_SPECS);

        expect(map.isWalkable(2, 4)).toBe(false);
        expect(map.isWalkable(3, 4)).toBe(false); // предмет шириной 2
        expect(map.isWalkable(4, 4)).toBe(true);
    });

    it('за высокой частью можно пройти', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'cabinet', x: 2, y: 4 }]), PROP_SPECS);

        expect(map.isWalkable(2, 3)).toBe(true); // высокая часть — не препятствие
        expect(map.isWalkable(2, 2)).toBe(true);
    });

    it('предмет неизвестного типа игнорируется, а не роняет карту', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'нет-такого', x: 2, y: 4 }]), PROP_SPECS);

        expect(map.isWalkable(2, 4)).toBe(true);
    });

    it('без каталога предметы не блокируют проход (карта разобрана «вслепую»)', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'cabinet', x: 2, y: 4 }]));

        expect(map.isWalkable(2, 4)).toBe(true);
    });

    it('карта без props работает как раньше', () => {
        const map = makeMap(baseMap(undefined), PROP_SPECS);

        expect(map.props).toEqual([]);
        expect(map.isWalkable(2, 4)).toBe(true);
    });

    it('спавн уезжает на дефолтный, если сохранённая клетка занята предметом', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'bin', x: 5, y: 5 }]), PROP_SPECS);

        expect(map.resolveSpawn({ x: 5, y: 5 })).toEqual({ x: 1, y: 1 });
    });
});

describe('помещается ли предмет', () => {
    it('шкаф с воздухом +2 не встаёт вплотную к верхнему краю', () => {
        const cabinet = orient('cabinet'); // 2×1, воздух +2

        expect(propFits(cabinet, 2, 1, 8, 8)).toBe(false);
        expect(propFits(cabinet, 2, 2, 8, 8)).toBe(true);
    });

    it('основание не должно вылезать вправо и вниз', () => {
        const cabinet = orient('cabinet');

        expect(propFits(cabinet, 7, 4, 8, 8)).toBe(false); // ширина 2, край на 8
        expect(propFits(cabinet, 6, 4, 8, 8)).toBe(true);
    });
});

describe('где персонаж накрыт верхним слоем', () => {
    // Овал прозрачности включается только на этих клетках: иначе он дырявил бы
    // предмет, мимо которого просто проходят сбоку.
    it('клетки над основанием шкафа накрыты, а сам шкаф и соседи — нет', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'cabinet', x: 2, y: 4 }]), PROP_SPECS); // 2×1, воздух +2

        expect(map.isOverhead(2, 3)).toBe(true); // первый тайл воздуха
        expect(map.isOverhead(2, 2)).toBe(true); // второй
        expect(map.isOverhead(3, 3)).toBe(true); // предмет шириной 2

        expect(map.isOverhead(2, 4)).toBe(false); // основание — под игроками
        expect(map.isOverhead(2, 1)).toBe(false); // выше предмета
        expect(map.isOverhead(4, 3)).toBe(false); // сбоку — тот самый баг
    });

    it('у предмета без воздуха накрытых клеток нет', () => {
        // стол для встреч боком: ориентация east — 1×2, воздух 0
        const map = makeMap(baseMap([{ id: 'p', type: 'meeting-table', x: 2, y: 4, dir: 'east' }]), PROP_SPECS);

        expect(map.isOverhead(2, 3)).toBe(false);
        expect(map.isOverhead(2, 4)).toBe(false);
    });

    it('верхушка стены накрывает клетку, на которой стоит персонаж', () => {
        const map = makeMap(baseMap([]), PROP_SPECS);

        expect(map.isOverhead(3, 6)).toBe(true); // под ней нижняя стена карты
        expect(map.isOverhead(3, 5)).toBe(false); // строкой выше уже чистый пол
    });

    it('предмет неизвестного типа не даёт накрытых клеток', () => {
        const map = makeMap(baseMap([{ id: 'p', type: 'нет-такого', x: 2, y: 4 }]), PROP_SPECS);

        expect(map.isOverhead(2, 3)).toBe(false);
    });
});

describe('верхушка стены', () => {
    it('клетка над стеной — верхушка, а сама стена — нет', () => {
        const map = makeMap(baseMap([]), PROP_SPECS);

        expect(map.isWallCrown(3, 6)).toBe(true); // под ней нижняя стена карты
        expect(map.isWallCrown(3, 7)).toBe(false); // это уже сама стена
        expect(map.isWallCrown(3, 3)).toBe(false); // чистый пол
    });
});
