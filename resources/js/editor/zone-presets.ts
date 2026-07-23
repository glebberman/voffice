/**
 * Пресеты областей: тип помещения задаёт цвет оверлея, дефолтное имя и
 * приватность. Слоги `kind` совпадают со слогами оси «тип помещения» каталога
 * предметов — задел под подсказки предметов под область. Игра `kind` пока
 * игнорирует; отсутствие kind у зоны = «своя».
 */
export interface ZonePreset {
    kind: string;
    label: string;
    color: number; // цвет оверлея зоны в редакторе
    isPrivate: boolean;
}

// «Своя» — и пункт списка, и типизированный фолбэк для неизвестного kind
const CUSTOM_PRESET: ZonePreset = { kind: 'custom', label: 'Своя', color: 0x9ca3af, isPrivate: false };

export const ZONE_PRESETS: ZonePreset[] = [
    { kind: 'openspace', label: 'Опенспейс', color: 0xb08968, isPrivate: false },
    { kind: 'meeting', label: 'Переговорка', color: 0x7c6fae, isPrivate: true },
    { kind: 'kitchen', label: 'Кухня', color: 0x8aafa5, isPrivate: false },
    { kind: 'lounge', label: 'Лаунж', color: 0xd98e73, isPrivate: false },
    { kind: 'stage', label: 'Сцена', color: 0xe0b64a, isPrivate: false },
    CUSTOM_PRESET,
];

const BY_KIND = new Map(ZONE_PRESETS.map((p) => [p.kind, p]));

/** Пресет по kind зоны; неизвестный или отсутствующий kind — «своя». */
export function zonePreset(kind: string | undefined): ZonePreset {
    return (kind !== undefined ? BY_KIND.get(kind) : undefined) ?? CUSTOM_PRESET;
}

/** Цвет пресета как CSS-hex — для чипов в панели. */
export function zoneColorCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}
