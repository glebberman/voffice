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

    it('идентификаторы вкладок различаются', () => {
        const ids = new Set([newTabId(), newTabId(), newTabId()]);

        expect(ids.size).toBe(3);
    });
});
