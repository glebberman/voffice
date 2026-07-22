import { parseEmbedSettings } from '@/game/behaviors';
import { describe, expect, it } from 'vitest';

describe('parseEmbedSettings', () => {
    it('разбирает валидные настройки', () => {
        expect(parseEmbedSettings({ label: 'Доска', url: 'https://example.com' })).toEqual({ label: 'Доска', url: 'https://example.com' });
    });

    it('без адреса или подписи — null (предмет ещё не настроен)', () => {
        expect(parseEmbedSettings({ label: 'Доска' })).toBeNull();
        expect(parseEmbedSettings({ url: 'https://example.com' })).toBeNull();
        expect(parseEmbedSettings({ label: '   ', url: 'https://example.com' })).toBeNull();
        expect(parseEmbedSettings({ label: 'Доска', url: '' })).toBeNull();
    });

    it('мусорные настройки — null (форму из карты не берём на веру)', () => {
        expect(parseEmbedSettings(null)).toBeNull();
        expect(parseEmbedSettings('nope')).toBeNull();
        expect(parseEmbedSettings({ label: 1, url: 2 })).toBeNull();
    });

    it('не-http(s) схемы отсекаются — адрес уезжает в iframe', () => {
        // карты сидятся из репозитория мимо серверной валидации, клиент — последний гейт
        expect(parseEmbedSettings({ label: 'X', url: 'javascript://c%0aalert(1)' })).toBeNull();
        expect(parseEmbedSettings({ label: 'X', url: 'file:///etc/passwd' })).toBeNull();
        expect(parseEmbedSettings({ label: 'X', url: 'не-адрес' })).toBeNull();
        expect(parseEmbedSettings({ label: 'X', url: ' https://example.com ' })).toEqual({ label: 'X', url: 'https://example.com' });
    });
});
