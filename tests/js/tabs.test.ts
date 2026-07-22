import { newTabId, shouldYieldTo } from '@/game/tabs';
import { describe, expect, it } from 'vitest';

describe('одна вкладка на пользователя', () => {
    const me = 7;
    const myTab = 'tab-a';

    it('уступаем другой вкладке того же пользователя', () => {
        expect(shouldYieldTo({ id: me, tab: 'tab-b' }, me, myTab)).toBe(true);
    });

    it('на собственное приветствие не реагируем', () => {
        // своё эхо не должно заставлять вкладку замолчать
        expect(shouldYieldTo({ id: me, tab: myTab }, me, myTab)).toBe(false);
    });

    it('приветствие другого человека не трогает нас', () => {
        expect(shouldYieldTo({ id: 42, tab: 'tab-b' }, me, myTab)).toBe(false);
        expect(shouldYieldTo({ id: 42, tab: myTab }, me, myTab)).toBe(false);
    });

    it('открывшиеся разом вкладки не замолкают обе', () => {
        // восстановление сессии браузера: каждая получает чужое «привет» сразу
        // после своего — уступает ровно одна, по сравнению идентификаторов
        const justNow = 100;
        expect(shouldYieldTo({ id: me, tab: 'tab-b' }, me, 'tab-a', justNow)).toBe(true);
        expect(shouldYieldTo({ id: me, tab: 'tab-a' }, me, 'tab-b', justNow)).toBe(false);
    });

    it('давно открытая вкладка уступает новой без сравнений', () => {
        // 'tab-z' > 'tab-a', но мы здоровались давно — значит новая та, другая
        expect(shouldYieldTo({ id: me, tab: 'tab-a' }, me, 'tab-z', 60_000)).toBe(true);
    });

    it('идентификаторы вкладок различаются', () => {
        const ids = new Set([newTabId(), newTabId(), newTabId()]);

        expect(ids.size).toBe(3);
    });
});
