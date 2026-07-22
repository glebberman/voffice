import { newTabId, shouldYieldTo } from '@/game/tabs';
import { describe, expect, it } from 'vitest';

describe('одна вкладка на пользователя', () => {
    const me = 7;
    const myTab = 'tab-a';
    const hello = (tab: string, at: number, id = me) => ({ id, tab, at });

    it('уступаем вкладке, поздоровавшейся позже нас', () => {
        expect(shouldYieldTo(hello('tab-b', 2000), me, myTab, 1000)).toBe(true);
    });

    it('вкладке, поздоровавшейся раньше, не уступаем', () => {
        // её приветствие могло дойти позже нашего — решает метка, а не порядок
        expect(shouldYieldTo(hello('tab-b', 1000), me, myTab, 2000)).toBe(false);
    });

    it('на собственное приветствие не реагируем', () => {
        // своё эхо не должно заставлять вкладку замолчать
        expect(shouldYieldTo(hello(myTab, 5000), me, myTab, 1000)).toBe(false);
    });

    it('приветствие другого человека не трогает нас', () => {
        expect(shouldYieldTo(hello('tab-b', 9000, 42), me, myTab, 1000)).toBe(false);
        expect(shouldYieldTo(hello(myTab, 9000, 42), me, myTab, 1000)).toBe(false);
    });

    it('решение симметрично: активной остаётся ровно одна вкладка', () => {
        // обе решают по одним и тем же данным, поэтому неважно, кто что услышал
        const a = { tab: 'tab-a', at: 1000 };
        const b = { tab: 'tab-b', at: 3000 };
        const aYields = shouldYieldTo(hello(b.tab, b.at), me, a.tab, a.at);
        const bYields = shouldYieldTo(hello(a.tab, a.at), me, b.tab, b.at);

        expect([aYields, bYields]).toEqual([true, false]);
    });

    it('ничья по метке разводится идентификаторами — тоже ровно одна', () => {
        const same = 4242;
        const aYields = shouldYieldTo(hello('tab-b', same), me, 'tab-a', same);
        const bYields = shouldYieldTo(hello('tab-a', same), me, 'tab-b', same);

        expect([aYields, bYields]).toEqual([true, false]);
    });

    it('идентификаторы вкладок различаются', () => {
        const ids = new Set([newTabId(), newTabId(), newTabId()]);

        expect(ids.size).toBe(3);
    });
});
