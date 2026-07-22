import type { PropBehavior } from '@/game/behaviors';
import { EmbedForm } from './EmbedForm';

/**
 * Настройки поведения выделенного предмета: по behavior типа выбирается форма.
 * Пишет в `props[].settings` карты (у каждого поставленного предмета они свои).
 * Обычная мебель (behavior null) и поведения без настроек в карте не рисуют
 * ничего: switchable берёт состояния у типа, настройки инстанса ему не нужны.
 */
export function BehaviorSettings({
    behavior,
    settings,
    onChange,
}: {
    behavior: PropBehavior | null | undefined;
    settings: Record<string, string> | undefined;
    onChange: (settings: Record<string, string>) => void;
}): React.ReactNode {
    if (behavior === 'embed') {
        return <EmbedForm settings={settings} onChange={onChange} />;
    }
    return null;
}
