// Поведения предмета — как с ним взаимодействуют, стоя в его зоне. Реестр
// живёт в коде (серверная калька — App\Support\PropBehaviors): у типа хранится
// только имя, а что оно значит и какие настройки инстанса принимает — здесь.

export const PROP_BEHAVIORS = ['embed', 'switchable'] as const;

export type PropBehavior = (typeof PROP_BEHAVIORS)[number];

export const PROP_BEHAVIOR_LABEL: Record<PropBehavior, string> = {
    embed: 'Встраиваемое окно (доска/видео/карта)',
    switchable: 'Переключаемые состояния',
};

/** Настройки инстанса embed в карте: подпись модалки и адрес iframe. */
export interface EmbedSettings {
    label: string;
    url: string;
}

/**
 * Разбор настроек embed из `props[].settings` с рантайм-проверкой: settings
 * приезжают из карты как есть, поэтому форму не берём на веру. Возвращает null,
 * если предмет ещё не настроен (нет подписи/адреса) — такой просто неинтерактивен.
 */
export function parseEmbedSettings(raw: unknown): EmbedSettings | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const { label, url } = record;
    if (typeof label !== 'string' || label.trim() === '' || typeof url !== 'string') {
        return null;
    }
    // адрес уезжает в iframe, поэтому пускаем только http(s) — и здесь тоже, а
    // не только на сервере: карты сидятся из репозитория (RoomSeeder читает
    // resources/maps/*.json мимо MapUpdateRequest), так что клиент — последний гейт
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        return null;
    }
    return { label, url: trimmed };
}
